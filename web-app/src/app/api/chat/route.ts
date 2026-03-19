import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
    const { data: documents, error } = await supabase.rpc('match_legal_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5, // Qué tan estricta es la similitud (0.5 es un buen punto de partida)
      match_count: 3        // Traer los 3 artículos más relevantes
    });

    if (error) throw error;

    // 4. Construir el contexto para Gemini
    let contextText = "";
    let sources: any[] = [];

    if (documents && documents.length > 0) {
      contextText = documents.map((doc: any) => `Ley: ${doc.nombre_ley} | Artículo: ${doc.articulo}\nContenido: ${doc.contenido}`).join('\n\n');
      // Guardamos las fuentes para mostrarlas en la UI
      sources = documents.map((doc: any) => ({
        ley: doc.nombre_ley,
        articulo: doc.articulo,
      }));
    } else {
      contextText = "No se encontró información legal relevante en la base de datos para esta consulta.";
    }

    // 5. Configurar Gemini 1.5 Flash con el System Prompt
    const chatModel = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: `Eres 'Directum', un asistente legal chileno empático y experto en Lenguaje Claro.
      Tu objetivo es explicar el contexto legal adjunto de forma muy sencilla, como si le hablaras a un amigo.
      REGLAS:
      1. Basa tu respuesta ÚNICAMENTE en el contexto proporcionado.
      2. Si el contexto dice que no hay información, dile al usuario amablemente que tu base de datos (BCN) aún no tiene esa ley.
      3. Usa lenguaje chileno neutro y cercano.
      4. Termina siempre con un tono de apoyo, pero advirtiendo brevemente que eres una IA y esto no es asesoría legal formal.`
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

  } catch (error: any) {
    console.error("Error en el RAG:", error);
    return NextResponse.json({ error: "Hubo un error al procesar tu consulta legal." }, { status: 500 });
  }
}