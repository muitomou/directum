'use client';

import { useState } from 'react';
import { Send, Scale, Loader2, AlertCircle } from 'lucide-react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Message = {
  role: 'user' | 'ai';
  content: string;
  sources?: { ley: string; articulo: string; norma_id?: string }[];
};

const markdownComponents: Components = {
  p: ({ node, ...props }) => <p className="mb-3 last:mb-0" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold text-slate-900" {...props} />,
  ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-3 space-y-1.5" {...props} />,
  ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-3 space-y-1.5" {...props} />,
  li: ({ node, ...props }) => <li className="marker:text-slate-400" {...props} />,
  em: ({ node, ...props }) => <em className="block mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 italic" {...props} />
};

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', content: '¡Hola! Soy Directum. ¿Tienes alguna duda sobre tus derechos laborales o como consumidor hoy?' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429 || res.status === 403) {
          setRateLimited(true);
          setTimeout(() => setRateLimited(false), 5000);
          setMessages(prev => [...prev, { role: 'ai', content: 'Estamos recibiendo muchas consultas en este momento. Por favor, espera un minuto y vuelve a intentarlo.' }]);
          return;
        }
        throw new Error(data.error);
      }

      setMessages(prev => [...prev, { 
        role: 'ai', 
        content: data.text,
        sources: data.sources 
      }]);
    } catch {
      setMessages(prev => [...prev, { role: 'ai', content: 'Ups, tuve un problema conectando con la base legal. Intenta de nuevo.' }]);
    } finally {
      setIsLoading(false);
    }
  };

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
        
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl p-4 ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-sm' 
                  : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm'
              }`}>
                
                {msg.role === 'user' ? (
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
                {msg.role === 'ai' && msg.sources && msg.sources.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-200">
                    <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider flex items-center gap-1">
                      <AlertCircle size={12} /> Fuentes consultadas:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {msg.sources.map((source, idx) => {
                        const bcnUrl = source.norma_id 
                          ? `https://www.bcn.cl/leychile/navegar?idNorma=${source.norma_id}`
                          : '#';
                        return (
                          <a 
                            key={idx} 
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
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 rounded-2xl rounded-tl-sm p-4 text-slate-500 flex items-center gap-2">
                <Loader2 size={18} className="animate-spin text-blue-600" /> Consultando la BCN...
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-100">
          <form onSubmit={sendMessage} className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ej: ¿Me pueden obligar a trabajar feriado?"
              className="w-full pl-5 pr-14 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700"
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