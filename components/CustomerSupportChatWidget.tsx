'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import {
  MessageSquare,
  X,
  Minimize2,
  Send,
  Loader2,
  Sparkles,
  Bot,
  User,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const DEFAULT_SUGGESTIONS = [
  'What materials do you accept & rates?',
  'Where is my pickup agent?',
  'Explain the ₹99 offer for >7 kg',
  'How do Razorpay payments work?',
  'What locations are supported?',
];

export default function CustomerSupportChatWidget({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content:
        '👋 Welcome to Junk It Out! I am your 24/7 Support Assistant. I can help you with live scrap rates, accepted materials, doorstep pickup bookings, and live order tracking. How can I help you today?',
      timestamp: 'Just now',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized, loading]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, isMinimized]);

  // Do not render on Admin or Agent portals
  if (pathname.startsWith('/admin') || pathname.startsWith('/agent')) {
    return null;
  }

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const historyPayload = messages.slice(-5).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/support/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
        }),
      });

      const data = await res.json();
      if (data.success && data.text) {
        const assistantMsg: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        if (Array.isArray(data.suggestedQuestions) && data.suggestedQuestions.length > 0) {
          setSuggestions(data.suggestedQuestions);
        }
      } else {
        const errorMsg: Message = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content:
            data.message ||
            'I am currently checking with our operations system. Please try again in a few seconds or contact us directly at support@junkitout.in.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch {
      const fallbackMsg: Message = {
        id: `fail-${Date.now()}`,
        role: 'assistant',
        content:
          'Could not reach customer support network. Please check your internet connection or email us at support@junkitout.in.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setLoading(false);
    }
  };

  const resetChat = () => {
    setMessages([
      {
        id: 'welcome-reset',
        role: 'assistant',
        content:
          '👋 Chat refreshed! How can I assist you with your scrap collection or doorstep pickup today?',
        timestamp: 'Just now',
      },
    ]);
    setSuggestions(DEFAULT_SUGGESTIONS);
  };

  return (
    <>
      {/* FLOATING LAUNCHER BUTTON */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setIsMinimized(false);
          }}
          aria-label="Open 24/7 AI Customer Support"
          className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 group flex items-center gap-2.5 rounded-full bg-slate-900 text-white pl-4 pr-5 py-3.5 shadow-2xl hover:bg-slate-800 border-2 border-emerald-500/40 hover:border-emerald-400 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
        >
          <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
            <Bot className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border border-slate-900" />
            </span>
          </div>
          <div className="text-left">
            <span className="block text-xs font-black tracking-wide leading-none">Junk It Out Support</span>
            <span className="block text-[10px] text-emerald-400 font-semibold mt-1">24/7 Live • English / ಕನ್ನಡ / Hindi</span>
          </div>
        </button>
      )}

      {/* CHAT WINDOW / MODAL */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Junk It Out Customer Support Chat"
          className={`fixed z-50 transition-all duration-300 ease-out flex flex-col shadow-2xl border border-slate-700/60 bg-white ${
            isMinimized
              ? 'bottom-20 md:bottom-6 right-4 md:right-6 w-72 h-14 rounded-2xl overflow-hidden'
              : 'bottom-20 md:bottom-6 right-4 md:right-6 w-[calc(100vw-2rem)] sm:w-[420px] h-[580px] max-h-[calc(100dvh-6.5rem)] rounded-3xl overflow-hidden'
          }`}
        >
          {/* HEADER */}
          <header className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shrink-0 select-none border-b border-slate-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                <Bot className="w-4 h-4" />
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-slate-900" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-black tracking-wide text-white truncate flex items-center gap-1.5">
                  Junk It Out Support
                  <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 text-[9px] font-bold rounded">24/7 Live</span>
                </h3>
                <p className="text-[10px] text-slate-400 truncate">Live Database Verification & Rates</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={resetChat}
                title="Restart Chat"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Restart chat"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsMinimized(!isMinimized)}
                title={isMinimized ? 'Expand' : 'Minimize'}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label={isMinimized ? 'Expand' : 'Minimize'}
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close Support Chat"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close support chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* CHAT BODY (HIDDEN WHEN MINIMIZED) */}
          {!isMinimized && (
            <>
              {/* MESSAGES CONTAINER */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50 text-xs">
                {messages.map((m) => {
                  const isUser = m.role === 'user';
                  return (
                    <div
                      key={m.id}
                      className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isUser && (
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-200">
                          <Bot className="w-4 h-4" />
                        </div>
                      )}

                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-sm text-xs leading-relaxed ${
                          isUser
                            ? 'bg-slate-900 text-white rounded-tr-xs'
                            : 'bg-white text-slate-800 border border-slate-200/90 rounded-tl-xs whitespace-pre-line'
                        }`}
                      >
                        <p>{m.content}</p>
                        <span
                          className={`block text-[9px] mt-1 text-right ${
                            isUser ? 'text-slate-400' : 'text-slate-400'
                          }`}
                        >
                          {m.timestamp}
                        </span>
                      </div>

                      {isUser && (
                        <div className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center shrink-0 mt-0.5">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* TYPING INDICATOR */}
                {loading && (
                  <div className="flex gap-2.5 justify-start items-center">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 border border-emerald-200">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-xs flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce" />
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.2s]" />
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:0.4s]" />
                      <span className="text-[10px] font-semibold text-slate-500 ml-1.5">Retrieving live data...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* QUICK SUGGESTIONS PILLS */}
              {suggestions.length > 0 && !loading && (
                <div className="px-3 py-2 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                  <span className="text-[10px] font-bold text-slate-400 shrink-0 uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                  </span>
                  {suggestions.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSend(s)}
                      className="shrink-0 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200/80 px-2.5 py-1 rounded-full transition-colors cursor-pointer"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* INPUT FORM */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="p-2.5 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask in English, ಕನ್ನಡ, or Hindi..."
                  disabled={loading}
                  className="flex-1 h-10 px-3.5 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center hover:bg-emerald-600 disabled:opacity-40 disabled:hover:bg-slate-900 transition-colors cursor-pointer shrink-0"
                  aria-label="Send support question"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin text-emerald-400" /> : <Send className="w-4 h-4" />}
                </button>
              </form>

              {/* FOOTER NOTICE */}
              <div className="bg-slate-50 px-3 py-1.5 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                  Live Database Connected
                </span>
                <span>Junk It Out Support</span>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
