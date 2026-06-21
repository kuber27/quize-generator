/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Chatbot component with:
 * - SSE streaming via fetch + ReadableStream (token-by-token typewriter effect)
 * - KaTeX math rendering via remark-math + rehype-katex
 * - Syntax-highlighted code blocks
 * - Streaming cursor animation while generating
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  Send,
  BrainCircuit,
  AlertCircle,
  Trash2,
  Zap,
  Database,
} from "lucide-react";
import { ChatMessage } from "../types";

interface ChatbotProps {
  documentId: string;
  documentTitle: string;
}

const SUGGESTION_CHIPS = [
  "Explain the core equations or formulas in this document.",
  "Give me a vocabulary summary of key terms.",
  "Summarise the main argument in 3 clear steps.",
  "What are the most important concepts to memorise?",
];

export const Chatbot: React.FC<ChatbotProps> = ({ documentId, documentTitle }) => {
  const makeGreeting = (): ChatMessage => ({
    id: "greeting",
    role: "assistant",
    content: `Hello! I've processed **${documentTitle}** into my semantic knowledge index.\n\nI'm strictly constrained to answer only using information from your uploaded document — including formulas, definitions, and arguments. Ask me anything!`,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem(`pdf_app_chat_${documentId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse saved chat history:", e);
      }
    }
    return [
      {
        id: "greeting",
        role: "assistant",
        content: `Hello! I've processed **${documentTitle}** into my semantic knowledge index.\n\nI'm strictly constrained to answer only using information from your uploaded document — including formulas, definitions, and arguments. Ask me anything!`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }
    ];
  });

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`pdf_app_chat_${documentId}`, JSON.stringify(messages));
    }
  }, [messages, documentId]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vectorMode, setVectorMode] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch vector mode on mount
  useEffect(() => {
    fetch("/api/config-status")
      .then((r) => r.json())
      .then((d) => setVectorMode(d.vectorMode || null))
      .catch(() => {});
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  const handleSend = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || loading) return;

    setInput("");
    setError(null);

    const userMsg: ChatMessage = {
      id: "usr_" + crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    // Bot message placeholder (will be filled token by token)
    const botMsgId = "bot_" + crypto.randomUUID();
    const botMsg: ChatMessage = {
      id: botMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
    setLoading(true);
    setStreamingId(botMsgId);

    // Build history payload (excluding greeting)
    const historyPayload = messages
      .filter((m) => m.id !== "greeting")
      .map((m) => ({ role: m.role, content: m.content }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          documentId,
          message: trimmed,
          history: historyPayload,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error((errData as any).error || `Server error ${response.status}`);
      }

      // Parse SSE stream from the response body
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        // SSE frames are separated by double newlines
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? ""; // keep incomplete frame in buffer

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;

          try {
            const data = JSON.parse(raw);

            if (data.token) {
              // Append token to the bot message
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === botMsgId ? { ...m, content: m.content + data.token } : m
                )
              );
            }

            if (data.done || data.error) {
              if (data.error) setError(data.error);
              break;
            }
          } catch {
            // Malformed frame — ignore
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        // User cancelled — leave partial content
      } else {
        console.error("[Chat]", err);
        setError(err.message || "Failed to reach the study assistant.");
        // Remove empty bot message if nothing was streamed
        setMessages((prev) => {
          const bot = prev.find((m) => m.id === botMsgId);
          if (bot && !bot.content) return prev.filter((m) => m.id !== botMsgId);
          return prev;
        });
      }
    } finally {
      setLoading(false);
      setStreamingId(null);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(input);
  };

  const handleAbort = () => {
    abortRef.current?.abort();
  };

  const handleResetChat = () => {
    abortRef.current?.abort();
    localStorage.removeItem(`pdf_app_chat_${documentId}`);
    setMessages([makeGreeting()]);
    setError(null);
    setLoading(false);
    setStreamingId(null);
  };

  return (
    <div className="flex flex-col h-[620px] bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="h-2.5 w-2.5 bg-emerald-500 rounded-full border border-emerald-400/40" />
            {loading && (
              <div className="absolute inset-0 h-2.5 w-2.5 bg-emerald-400 rounded-full animate-ping opacity-75" />
            )}
          </div>
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <BrainCircuit className="h-4 w-4 text-indigo-600 shrink-0" />
              Document Brain Index
            </h3>
            <p className="text-[10px] text-slate-400 select-none">
              Constrained strictly to uploaded study source
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Vector mode badge */}
          {vectorMode && (
            <span className="hidden sm:flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border border-indigo-150 bg-indigo-50 text-indigo-600 select-none">
              <Database className="h-3 w-3" />
              {vectorMode === "supabase-pgvector" ? "pgvector" : "in-memory"}
            </span>
          )}
          <button
            onClick={handleResetChat}
            title="Clear conversation"
            className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-all cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 chat-scrollbar">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const isStreaming = msg.id === streamingId;

          return (
            <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[88%] rounded-2xl p-4 shadow-sm transition-all ${
                  isUser
                    ? "bg-indigo-600 text-white rounded-br-none"
                    : "bg-white border border-slate-200 text-slate-800 rounded-bl-none"
                }`}
              >
                {/* Markdown + KaTeX rendering */}
                <div
                  className={`prose prose-sm max-w-none text-xs sm:text-sm leading-relaxed ${
                    isUser ? "prose-invert text-white" : "text-slate-800"
                  }`}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      p: ({ children }) => (
                        <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
                      ),
                      ul: ({ children }) => (
                        <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>
                      ),
                      li: ({ children }) => (
                        <li className="leading-relaxed">{children}</li>
                      ),
                      strong: ({ children }) => (
                        <strong className={`font-bold ${isUser ? "text-indigo-100" : "text-slate-900"}`}>
                          {children}
                        </strong>
                      ),
                      h3: ({ children }) => (
                        <h3 className={`text-sm font-bold mb-1 mt-3 first:mt-0 ${isUser ? "text-white" : "text-slate-900"}`}>
                          {children}
                        </h3>
                      ),
                      code: ({ children, className }) => {
                        // Block code (has language class)
                        const isBlock = className?.startsWith("language-");
                        if (isBlock) return <code className={className}>{children}</code>;
                        return (
                          <code
                            className={`px-1.5 py-0.5 rounded font-mono text-xs border ${
                              isUser
                                ? "bg-indigo-700 text-indigo-100 border-indigo-500/30"
                                : "bg-slate-100 text-indigo-700 border-slate-200"
                            }`}
                          >
                            {children}
                          </code>
                        );
                      },
                      pre: ({ children }) => (
                        <pre
                          className={`p-3 rounded-xl border my-2 overflow-x-auto font-mono text-xs leading-relaxed ${
                            isUser
                              ? "bg-indigo-700/80 text-indigo-100 border-indigo-500/30"
                              : "bg-slate-50 text-slate-800 border-slate-200"
                          }`}
                        >
                          {children}
                        </pre>
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>

                  {/* Streaming cursor */}
                  {isStreaming && (
                    <span className="inline-block w-0.5 h-4 bg-indigo-500 ml-0.5 align-middle streaming-cursor" />
                  )}
                </div>

                <span
                  className={`text-[9px] block text-right mt-1.5 select-none ${
                    isUser ? "text-indigo-200" : "text-slate-400"
                  }`}
                >
                  {msg.timestamp}
                </span>
              </div>
            </div>
          );
        })}

        {/* Loading skeleton (before first token arrives) */}
        {loading && streamingId && messages.find((m) => m.id === streamingId)?.content === "" && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none px-5 py-3.5 flex items-center space-x-1.5 shadow-sm">
              <span className="h-1.5 w-1.5 bg-indigo-500 rounded-full animate-bounce" />
              <span className="h-1.5 w-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.15s]" />
              <span className="h-1.5 w-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:0.3s]" />
              <span className="pl-2 uppercase tracking-widest text-[9px] font-bold text-slate-400 select-none">
                Querying context chunks…
              </span>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="flex items-start bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-xs space-x-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold block">Brain Query Issue</span>
              {error}
            </div>
          </div>
        )}

        {/* Suggestion chips — only when only the greeting exists */}
        {messages.length === 1 && !loading && (
          <div className="pt-2 space-y-3">
            <span className="text-[10px] uppercase tracking-widest font-extrabold text-slate-400 flex items-center gap-1.5">
              <Zap className="h-3 w-3" /> Suggested Queries
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTION_CHIPS.map((chip, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(chip)}
                  disabled={loading}
                  className="px-3.5 py-2.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-left text-xs text-slate-600 font-semibold hover:text-indigo-700 rounded-xl transition-all cursor-pointer shadow-sm disabled:opacity-50"
                  title={chip}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        className="p-4 bg-white border-t border-slate-200 flex space-x-2 shrink-0"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about formulas, definitions, concepts…"
          disabled={loading}
          className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs sm:text-sm text-slate-800 placeholder-slate-400 disabled:opacity-50 focus:bg-white transition-all"
        />
        {loading ? (
          <button
            type="button"
            onClick={handleAbort}
            className="p-2.5 bg-rose-500 hover:bg-rose-400 text-white rounded-xl transition-all cursor-pointer shrink-0 shadow-sm"
            title="Stop generating"
          >
            <span className="h-4 w-4 flex items-center justify-center font-bold text-xs">■</span>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-all cursor-pointer shrink-0 shadow-sm"
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </form>
    </div>
  );
};
