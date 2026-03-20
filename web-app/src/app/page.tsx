'use client';

import { useState } from 'react';
import { Send, Scale, Loader2, AlertCircle } from 'lucide-react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChat, Message } from 'ai/react';

const markdownComponents: Components = {
  p: ({ node, ...props }) => <p className="mb-3 last:mb-0" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold text-slate-900" {...props} />,
  ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-3 space-y-1.5" {...props} />,
  ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-3 space-y-1.5" {...props} />,
  li: ({ node, ...props }) => <li className="marker:text-slate-400" {...props} />,
  em: ({ node, ...props }) => <em className="block mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 italic" {...props} />
};

export default function Home() {
  const [globalSources, setGlobalSources] = useState<any[][]>([]);
  const [rateLimited, setRateLimited] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
    initialMessages: [
      { id: 'welcome', role: 'assistant', content: '¡Hola! Soy Directum. ¿Tienes alguna duda sobre tus derechos laborales o como consumidor hoy?' }
    ],
    onResponse: (response: Response) => {
      // Borrar texto de estado dinámico porque el chunk / cache-hit ha llegado
      setStatusMsg(null); 
      
      if (response.status === 429 || response.status === 403) {
        setRateLimited(true);
        setTimeout(() => setRateLimited(false), 5000);
      }

      // Interceptar Fuentes enviadas codificadas desde el backend
      const xSources = response.headers.get('x-sources');
      if (xSources) {
        try {
          const parsed = JSON.parse(decodeURIComponent(xSources));
          setGlobalSources(prev => [...prev, parsed]);
        } catch (e) {
          console.error("Error parseando x-sources");
        }
      } else {
        setGlobalSources(prev => [...prev, []]);
      }
    }
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!input.trim() || isLoading) {
      e.preventDefault();
      return;
    }
    
    // Secuencia de estatus dinámico para mejorar la UX y percepción de velocidad
    setStatusMsg("Generando embedding...");
    
    setTimeout(() => {
      setStatusMsg(prev => prev ? "Consultando base de datos legal..." : null);
    }, 600);
    
    setTimeout(() => {
      setStatusMsg(prev => prev ? "Redactando respuesta..." : null);
    }, 1500);

    handleSubmit(e);
  };

  // Modern Skeleton Screen
  const SkeletonLoader = () => (
    <div className="flex justify-start animate-pulse">
      <div className="max-w-[85%] rounded-2xl p-4 bg-white border border-slate-200 shadow-sm rounded-tl-sm w-[280px] space-y-4">
        <div className="h-3 bg-slate-200 rounded-full w-3/4"></div>
        <div className="h-3 bg-slate-200 rounded-full w-full"></div>
        <div className="h-3 bg-slate-200 rounded-full w-5/6"></div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans relative">
      
      {/* 429 Error Toast */}
      {rateLimited && (
        <div className="absolute top-4 z-50 bg-amber-100 border border-amber-300 text-amber-800 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
          <AlertCircle size={18} />
          <p className="text-sm font-medium">Estamos recibiendo muchas consultas en este momento. Por favor, espera un minuto y vuelve a intentarlo.</p>
        </div>
      )}
      
      {/* Header */}
      <div className="w-full max-w-3xl mb-6 text-center">
        <div className="flex justify-center items-center gap-2 text-blue-900 mb-2">
          <Scale size={32} strokeWidth={2.5} />
          <h1 className="text-3xl font-bold tracking-tight">Directum</h1>
        </div>
        <p className="text-slate-500">Tus derechos, explicados en simple.</p>
      </div>

      {/* Chat Container */}
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[70vh]">
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg: Message, idx: number) => {
            const isUser = msg.role === 'user';
            
            // Calculamos indices excluyendo el initialMessage predefinido para parear las sources
            const aiIndex = isUser ? -1 : messages.slice(0, idx + 1).filter((m: Message) => m.role === 'assistant').length - 2;  
            const sources = aiIndex >= 0 ? globalSources[aiIndex] : null;

            return (
              <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl p-4 ${
                  isUser 
                    ? 'bg-blue-600 text-white rounded-tr-sm' 
                    : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'
                }`}>
                  
                  {isUser ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  ) : (
                    <div className="text-[15px] leading-relaxed text-slate-700">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        components={markdownComponents}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                  
                  {/* Fuentes Legales (Chips Clickeables BCN) */}
                  {!isUser && sources && sources.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-200">
                      <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider flex items-center gap-1">
                        <AlertCircle size={12} /> Fuentes consultadas:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {sources.map((source: any, sIdx: number) => {
                          const bcnUrl = source.norma_id && source.id_parte_bcn 
                            ? `https://www.bcn.cl/leychile/navegar?idNorma=${source.norma_id}&idParte=${source.id_parte_bcn}`
                            : source.norma_id
                            ? `https://www.bcn.cl/leychile/navegar?idNorma=${source.norma_id}`
                            : '#';
                          return (
                            <a 
                              key={sIdx} 
                              href={bcnUrl}
                              target={source.norma_id ? "_blank" : "_self"}
                              rel={source.norma_id ? "noopener noreferrer" : ""}
                              className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 shadow-sm transition-colors cursor-pointer"
                            >
                              📄 {source.ley} - {source.articulo}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          
          {/* Skeleton de 3 líneas (Vercel UX) + UI Dinámico */}
          {isLoading && messages[messages.length - 1]?.role === 'user' && (
            <div className="space-y-3">
              {statusMsg && (
                <div className="flex justify-start ml-2">
                  <p className="text-xs text-slate-400 flex items-center gap-1.5 font-medium animate-pulse">
                     <Loader2 size={12} className="animate-spin" /> {statusMsg}
                  </p>
                </div>
              )}
              <SkeletonLoader />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-100">
          <form onSubmit={onSubmit} className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              placeholder="Ej: ¿Me pueden obligar a trabajar feriado?"
              className="w-full pl-5 pr-14 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700 disabled:opacity-50"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={18} />
            </button>
          </form>
          <p className="text-center text-[10px] text-slate-400 mt-3">
            Directum es una IA con fines informativos. No reemplaza la asesoría legal profesional.
          </p>
        </div>

      </div>
    </div>
  );
}