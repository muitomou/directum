export const maxDuration = 60; // Optimización Vercel AI
export const dynamic = 'force-dynamic'; // Evita el cacheo agresivo de fetch() en Producción Vercel

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleGenerativeAIStream, StreamingTextResponse } from 'ai';

interface LegalDocument {
  nombre_ley: string;
  articulo: string;
  contenido: string;
  norma_id: string;
  id_parte_bcn?: string;
}

// 1. Inicializar clientes con las variables de entorno
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    // Vercel AI SDK envía la propiedad 'messages'
    const { messages } = await req.json();
    const lastMessage = messages?.[messages.length - 1];

    if (!lastMessage || !lastMessage.content) {
      return NextResponse.json({ error: "Falta el mensaje" }, { status: 400 });
    }

    const message = lastMessage.content;

    // 2. Generar el embedding de la pregunta del usuario (Normalizado para Caché)
    const normalizedMessage = message.trim().toLowerCase();
    const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const embeddingResult = await embeddingModel.embedContent(normalizedMessage);
    const queryEmbedding = embeddingResult.embedding.values;

    // 3. Evaluar Caché Semántico y RAG de forma Paralela
    const cachePromise = (async () => {
      try {
        return await supabase.rpc('match_query_cache', {
          query_embedding: queryEmbedding,
          match_threshold: 0.85
        });
      } catch (err: any) {
        console.error("Error silencioso buscando en query_cache:", err?.message || err);
        return { data: null, error: err };
      }
    })();

    const [cacheResponse, ragResponse] = await Promise.all([
      cachePromise,
      supabase.rpc('match_legal_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.5,
        match_count: 5
      })
    ]);

    // 4. CACHE HIT: Devolución inmediata sin IA (0ms latencia)
    if (cacheResponse.data && cacheResponse.data.length > 0) {
      const cacheHit = cacheResponse.data[0];
      console.log('Cache HIT: usando respuesta guardada');
      console.log('Similitud detectada:', cacheHit.similarity);

      // Envolvemos el string cacheado en un Stream nativo para que useChat no falle
      const stream = new ReadableStream({
        async start(controller) {
          // Protocolo Vercel AI SDK DataStream: 0:"texto"
          const chunk = `0:${JSON.stringify(cacheHit.response_text)}\n`;
          controller.enqueue(new TextEncoder().encode(chunk));

          // Delay de micro-tick para evitar que el stream termine instantáneamente
          // y le de tiempo al loop de React para acoplar los eventos.
          await new Promise(r => setTimeout(r, 50));

          controller.close();
        }
      });

      return new StreamingTextResponse(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'x-sources': encodeURIComponent(JSON.stringify(cacheHit.sources || [])),
          'Access-Control-Expose-Headers': 'x-sources'
        }
      });
    }

    // 5. CACHE MISS: Procesar la búsqueda (RAG normal)
    console.log('Cache MISS: llamando a Gemini');
    if (ragResponse.error) throw ragResponse.error;

    // Reranking Simulado: Seleccionamos solo los 3 mejores y descartamos metadata extraña
    const documentsData = ragResponse.data || [];
    const documents = documentsData.slice(0, 3);

    let contextText = "";
    let sources: any[] = [];

    if (documents.length > 0) {
      // Optimizamos enviando un contexto super limpio de tokens innecesarios
      contextText = documents.map((doc: LegalDocument) => `Ley: ${doc.nombre_ley} | Artículo: ${doc.articulo}\nContenido: ${doc.contenido}`).join('\n\n');
      sources = documents.map((doc: LegalDocument) => ({
        ley: doc.nombre_ley,
        articulo: doc.articulo,
        norma_id: doc.norma_id,
        id_parte_bcn: doc.id_parte_bcn
      }));
    } else {
      contextText = "No se encontró información legal relevante en la base de datos para esta consulta.";
    }

    // 6. Configurar modelo con System Prompt
    const chatModel = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: `Rol: Eres Directum, un asesor legal digital experto en derecho laboral chileno. Tono profesional, preciso, pedagógico y empático. Cero lenguaje informal (nada de "pega", "oye", "¿ya?").
Concisión Máxima: Las respuestas deben ser MUY cortas, directas y al grano. Pensadas para una lectura rápida en móvil.
Estructura: 1. Regla general (breve). 2. Excepciones (en bullet points). 3. Conclusión/Paso a seguir.
Formato: Usa negritas para destacar conceptos clave y los artículos citados (ej: **Art. 35 del Código del Trabajo**).
Discriminación: Ignora el contexto proporcionado que no responda directamente a la pregunta. No inventes leyes.
Disclaimer: Termina siempre con una nota breve en cursiva indicando que es información orientativa, no asesoría legal formal.`
    });

    const prompt = `Contexto legal encontrado:\n${contextText}\n\nPregunta del usuario: ${message}`;

    // 7. Solicitar el Stream desde Gemini
    const geminiStream = await chatModel.generateContentStream(prompt);

    // 8. Transformar al formato Vercel AI e interceptar el final para registrar en Caché
    const stream = GoogleGenerativeAIStream(geminiStream, {
      onCompletion: async (completion: string) => {
        try {
          const { error } = await supabase.from('query_cache').insert({
            query_text: message,
            embedding: queryEmbedding,
            response_text: completion,
            sources: sources
          });

          if (error) {
            console.error("Error al guardar en query_cache:", error.message || error);
          } else {
            console.log("Insert en query_cache finalizado exitosamente.");
          }
        } catch (e) {
          console.error("Excepción inesperada en onCompletion:", e);
        }
      }
    });

    // 9. Devolver el Stream transmitiendo las Fuentes Legales mediante el Header (Codificado UTF-8 seguro)
    return new StreamingTextResponse(stream, {
      headers: {
        'x-sources': encodeURIComponent(JSON.stringify(sources)),
        'Access-Control-Expose-Headers': 'x-sources'
      }
    });

  } catch (error: unknown) {
    console.error("Error en RAG/Streaming:", error);
    const err = error as any;
    if (err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('Too Many Requests')) {
      return NextResponse.json({ error: "Estamos recibiendo muchas consultas en este momento. Por favor, espera un minuto y vuelve a intentarlo." }, { status: 429 });
    }
    return NextResponse.json({ error: "Hubo un error al procesar tu consulta legal." }, { status: 500 });
  }
}