# Directum - Motor de Búsqueda y Asesoría Legal (RAG)

Plataforma de recuperación de información legal estructurada mediante Retrieval-Augmented Generation (RAG). El sistema procesa, vectoriza y consulta normativas del marco legal chileno para entregar respuestas de alta precisión con trazabilidad directa a las fuentes oficiales.

## Capacidades Principales

* **Búsqueda Semántica Optimizada:** Recuperación avanzada y contextual sobre la legislación vigente mediante similitud de vectores.
* **Respuestas Estructuradas:** Resultados jerarquizados (Regla general, Excepciones, Conclusión) con extracción automatizada de conceptos clave y artículos relevantes.
* **Trazabilidad Documental:** Inyección de referencias legales verificables con enlaces directos a la Biblioteca del Congreso Nacional.

## Stack Tecnológico

| Capa | Tecnología |
| :--- | :--- |
| **Frontend** | Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4 |
| **Backend & Base de Datos** | Supabase, PostgreSQL (`pgvector`) |
| **Motor AI & NLP** | Vercel AI SDK, Gemini 2.5 Flash, `gemini-embedding-001` |

## Arquitectura y Decisiones de Ingeniería

* **Caché Semántico y Concurrencia:** Patrón de ejecución paralela (`Promise.all`). Cada consulta evalúa la similitud del coseno (umbral del 95%) contra el histórico en la base vectorial. Esto reduce la latencia de inferencia a 0ms en consultas recurrentes, limitando el flujo RAG a un *fallback*.
* **Optimización de Búsqueda Vectorial:** Ingesta de normativas expuestas vía RPCs. El algoritmo de *fallback* inyecta un contexto estricto (Top-3 de fragmentos legales) para minimizar el consumo de tokens y acotar el espacio de alucinación del modelo generativo.
* **Streaming de Inferencia:** Implementación sobre Vercel AI SDK (`generateContentStream`) para emitir los bytes generados directamente a la interfaz. El ciclo intercepta la señal de completitud (`onCompletion`) para indexar asíncronamente el nuevo par pregunta/respuesta en el caché semántico.
* **Manejo de Latencia Perceptual:** Estrategia de UX compensatoria durante el *overhead* de inferencia, utilizando transiciones de estado de red y *skeleton screens* (`animate-pulse`) para mitigar la percepción de bloqueo.
* **Tolerancia a Fallos:** Control preventivo de *Rate Limiting* (HTTP 429) e interrupción controlada de la conexión en el cliente (*graceful degradation*) para prevenir la saturación del sistema upstream.

## Pipeline de Ejecución

1. El cliente envía la consulta mediante sincronización reactiva (`useChat`).
2. El sistema genera un embedding vectorial de la petición en tiempo real.
3. El backend lanza hilos paralelos para consultar el `query_cache` y aislar los artículos relevantes mediante la función `match_legal_documents`.
4. En caso de *Cache Hit*, la ejecución se interrumpe y retorna la respuesta preprocesada de forma inmediata.
5. En caso de *Cache Miss*, el modelo procesa el contexto inyectado y retorna la inferencia vía `StreamingTextResponse`. Las referencias bibliográficas se transfieren estructuradas a través de un Header HTTP personalizado (`x-sources`).
6. El resultado se documenta asíncronamente para retroalimentar la base de conocimiento local.

## Roadmap / Ideas a Futuro

* Extensión del pipeline de ingesta para procesar la Ley del Consumidor (Sernac) y el Código Civil.
* Implementación de persistencia de sesiones y autenticación de usuarios.
* Sistema de invalidación de caché basado en alertas de derogación o actualización normativa.

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
