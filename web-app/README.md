# Directum - Asesoría Legal Simple

> Búsqueda semántica y respuestas estructuradas sobre el marco legal chileno, de forma rápida y concisa.

## Key Features
- **Búsqueda Semántica Optimizada**: Búsqueda avanzada y contextual sobre la legislación (ej. Código del Trabajo).
- **Respuestas Estructuradas**: Resultados presentados en formato extremadamente claro (1. Regla general, 2. Excepciones, 3. Conclusión), destacando artículos y conceptos clave.
- **Fuentes Verificables**: Citas legales rastreables con enlaces (Chips) directos a la Biblioteca del Congreso Nacional (Ley Chile).

## Tech Stack
- **Frontend**: Next.js 16 (App Router + Turbopack), React 19, Tailwind CSS v4.
- **Backend & Almacenamiento**: Supabase con extensión `pgvector` para alojar y consultar la base vectorial.
- **IA & Modelos**: Gemini API (Gemini 2.5 Flash) para el motor cognitivo RAG; modelo de embeddings `text-embedding-004`.

## Engineering Highlights
- **Vector Search**: Las normativas son transformadas en embeddings mediante un script ETL en Python y empaquetadas en Supabase. Las consultas entrantes se vectorizan para correr una búsqueda de similitud coseno mediante RPCs de PostgreSQL, extrayendo los fragmentos legales más pertinentes.
- **Token Optimization (Top-3 Reranking)**: Para minimizar drásticamente la latencia y optimizar los costos de consumo de la API, el algoritmo solo inyecta en el prompt los 3 artículos con scores de similitud más altos, descartando la lectura de contexto redundante.
- **Robustness**: Implementación de un manejo preventivo de bloqueos (Error 429 - *Too Many Requests*) en el backend. Si superamos el Rate Limit, el cliente atrapa el estado 429 y lo comunica proactivamente con una degradación elegante (Alert/Toast), evitando quiebres en la UI.

## How it works
1. El usuario envía una consulta legal desde el Frontend.
2. El sistema genera un embedding vectorial de la pregunta.
3. Supabase (`match_legal_documents`) cruza este vector con los artículos legales y selecciona los 3 más similares.
4. El contexto optimizado se envía a Gemini 1.5 Flash usando un *System Prompt* severo (sin espacio a alucinaciones).
5. El backend devuelve la respuesta final estructurada junto a los `norma_id` de los artículos de respaldo.
6. El frontend parsea nativamente el Markdown y genera de forma automática enlaces clickeables a la BCN.

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
