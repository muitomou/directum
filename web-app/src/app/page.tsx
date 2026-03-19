'use client';

import { useState } from 'react';
import { Send, Scale, Loader2, AlertCircle } from 'lucide-react';

type Message = {
  role: 'user' | 'ai';
  content: string;
  sources?: { ley: string; articulo: string }[];
};

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', content: '¡Hola! Soy Directum. ¿Tienes alguna duda sobre tus derechos laborales o como consumidor hoy?' }
  ]);
  const [isLoading, setIsLoading] = useState(false);

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

      if (!res.ok) throw new Error(data.error);

      setMessages(prev => [...prev, { 
        role: 'ai', 
        content: data.text,
        sources: data.sources 
      }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', content: 'Ups, tuve un problema conectando con la base legal. Intenta de nuevo.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
      
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
                  : 'bg-slate-100 text-slate-800 rounded-tl-sm'
              }`}>
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                
                {/* Fuentes Legales (Cards) */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-200">
                    <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider flex items-center gap-1">
                      <AlertCircle size={12} /> Fuentes consultadas:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {msg.sources.map((source, idx) => (
                        <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-white text-blue-700 border border-blue-200 shadow-sm">
                          {source.ley} - {source.articulo}
                        </span>
                      ))}
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