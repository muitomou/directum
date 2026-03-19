# Directum - Asesoría Legal Simple

> Búsqueda semántica y respuestas estructuradas sobre el marco legal chileno, de forma rápida y concisa.

## Key Features
- **Búsqueda Semántica Optimizada**: Búsqueda avanzada y contextual sobre la legislación (ej. Código del Trabajo).
- **Respuestas Estructuradas**: Resultados presentados en formato extremadamente claro (1. Regla general, 2. Excepciones, 3. Conclusión), destacando artículos y conceptos clave.
- **Fuentes Verificables**: Citas legales rastreables con enlaces (Chips) directos a la Biblioteca del Congreso Nacional (Ley Chile).

## Tech Stack
- **Frontend**: Next.js 16 (App Router + Turbopack), React 19, Tailwind CSS v4, Vercel AI SDK.
- **Backend & Almacenamiento**: Supabase (`pgvector` para alojar embeddings de leyes y caching dinámico).
- **IA & Modelos**: Gemini API (Gemini 2.5 Flash) para el motor cognitivo RAG y respuestas en streaming; modelo de embeddings `gemini-embedding-001`.

## Engineering Highlights
- **Semantic Caching & Parallel Execution**: Resoluciones aceleradas por una arquitectura dual (`Promise.all`). Cada consulta vectorizada busca de forma simultánea un match en caché (`query_cache`) ofreciendo `0ms` de latencia de IA frente a repeticiones exactas (95% de similitud de coseno), y la tradicional búsqueda RAG como *fallback*.
- **Vector Search & Token Optimization**: Conversión de normativas a embeddings consultados por similitud coseno (RPCs). Durante el *fallback*, el algoritmo inyecta únicamente el Top-3 de fragmentos legales como contexto para mitigar la latencia y maximizar el rendimiento de tokens.
- **Streaming Architecture**: Implementación orientada a Vercel AI que utiliza `generateContentStream` para entregar los bytes generados directamente a la UI. Adicionalmente, el ciclo intercepta el final natural del flujo (usando el hook `onCompletion`) para grabar asíncronamente el nuevo par pregunta/respuesta en el caché semántico.
- **Perceptual Latency**: Enmascaramiento activo de cuellos de botella con una UX robusta combinando textos rotatorios de estado (ej: "Consultando base de legal...") y Skeleton Screens pre-renderizados (`animate-pulse`) reduciendo la sensación de estancamiento.
- **Robustness**: Implementación de un manejo preventivo de bloqueos (Error 429 - *Too Many Requests*) originado por congestión, interrumpiendo elegantemente al cliente antes del colapso del sistema con un suave banner (*Toast*).

## How it works
1. El usuario envía una consulta legal desde el Frontend (sincronizada reactivamente con `useChat`).
2. El sistema genera un embedding vectorial ligero de la pregunta usando el motor base de la SDK.
3. El backend arranca hilos paralelos consultando el `query_cache` (en búsqueda de usuarios pasados) y buscando al unísono el contenido legal crudo de los artículos en la DB usando `match_legal_documents`.
4. Si hay un *Cache Hit*, la ejecución se quiebra entregando la respuesta procesada en tiempo real sin llamar a la IA de Gemini. 
5. En caso de *Cache Miss*, la IA procesa velozmente el contenido y transfiere el resultado por `StreamingTextResponse`, pasando las citas bibliográficas estructuradas ocultas a través de un custom Header HTTP (`x-sources`).
6. El texto generado es asincrónicamente documentado para enriquecer la DB y servir a la próxima petición similar.

## Future Roadmap
- Extensión del corpus hacia la Ley del Consumidor (Sernac) y el Código Civil.
- Autenticación segura de usuarios e historial presistente de sesiones de chat.
- Alertas de cambios normativos o derogaciones a leyes cacheadas.

## Setup Local

1. Instalar dependencias:
   ```bash
   npm install
   ```

2. Configurar las variables de entorno creando un archivo `.env.local`:
   ```env
   # API Keys
   GEMINI_API_KEY="tu_clave_gemini"

   # Supabase
   SUPABASE_URL="tu_url_supabase"
   SUPABASE_KEY="tu_anon_key_supabase"
   ```

3. Levantar entorno local:
   ```bash
   npm run dev
   ```
