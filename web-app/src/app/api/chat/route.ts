import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface LegalDocument {
  nombre_ley: string;
  articulo: string;
  contenido: string;
  norma_id: string;
}

// 1. Inicializar clientes con las variables de entorno
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "Falta el mensaje" }, { status: 400 });
    }

    // 2. Generar el embedding de la pregunta del usuario
    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const embeddingResult = await embeddingModel.embedContent(message);
    const queryEmbedding = embeddingResult.embedding.values;

    // 3. Buscar en Supabase usando la función RPC que creamos en SQL
    const { data: documentsData, error } = await supabase.rpc('match_legal_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5, // Qué tan estricta es la similitud (0.5 es un buen punto de partida)
      match_count: 5        // Obtenemos un poco extra para hacer reranking en memoria
    });

    if (error) throw error;

    // Reranking Simulado: Seleccionamos solo los 3 mejores para pasarlos al prompt y omitimos el resto
    const documents = documentsData ? documentsData.slice(0, 3) : [];

    if (error) throw error;

    // 4. Construir el contexto para Gemini
    let contextText = "";
    let sources: any[] = [];

    if (documents && documents.length > 0) {
      contextText = documents.map((doc: LegalDocument) => `Ley: ${doc.nombre_ley} | Artículo: ${doc.articulo}\nContenido: ${doc.contenido}`).join('\n\n');
      // Guardamos las fuentes para mostrarlas en la UI
      sources = documents.map((doc: LegalDocument) => ({
        ley: doc.nombre_ley,
        articulo: doc.articulo,
        norma_id: doc.norma_id
      }));
    } else {
      contextText = "No se encontró información legal relevante en la base de datos para esta consulta.";
    }

    // 5. Configurar Gemini 1.5 Flash con el System Prompt
    const chatModel = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: `Rol: Eres Directum, un asesor legal digital experto en derecho laboral chileno. Tono profesional, preciso, pedagógico y empático. Cero lenguaje informal (nada de "pega", "oye", "¿ya?").
Concisión Máxima: Las respuestas deben ser MUY cortas, directas y al grano. Pensadas para una lectura rápida en móvil.
Estructura: 1. Regla general (breve). 2. Excepciones (en bullet points). 3. Conclusión/Paso a seguir.
Formato: Usa negritas para destacar conceptos clave y los artículos citados (ej: **Art. 35 del Código del Trabajo**).
Discriminación: Ignora el contexto proporcionado que no responda directamente a la pregunta. No inventes leyes.
Disclaimer: Termina siempre con una nota breve en cursiva indicando que es información orientativa, no asesoría legal formal.`
    });

    // 6. Generar la respuesta
    const prompt = `Contexto legal encontrado:\n${contextText}\n\nPregunta del usuario: ${message}`;
    const result = await chatModel.generateContent(prompt);
    const responseText = result.response.text();

    // 7. Devolver la respuesta y las fuentes al Frontend
    return NextResponse.json({
      text: responseText,
      sources: sources
    });

  } catch (error: unknown) {
    console.error("Error en el RAG:", error);
    
    // Capturamos el error 429 de la API
    const err = error as any;
    if (err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('Too Many Requests')) {
      return NextResponse.json({ error: "Estamos recibiendo muchas consultas en este momento. Por favor, espera un minuto y vuelve a intentarlo." }, { status: 429 });
    }

    return NextResponse.json({ error: "Hubo un error al procesar tu consulta legal." }, { status: 500 });
  }
}