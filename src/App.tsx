/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { UploadSection } from "./components/UploadSection";
import { FlashcardDeck } from "./components/FlashcardDeck";
import { QuizComponent } from "./components/QuizComponent";
import { Chatbot } from "./components/Chatbot";
import { Sparkles, FileText, CheckCircle2, MessageSquare, BookOpen, ArrowLeft, RefreshCw, AlertTriangle } from "lucide-react";
import { StudyGuide } from "./types";

export default function App() {
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [studyGuide, setStudyGuide] = useState<Omit<StudyGuide, "documentId"> | null>(null);
  const [activeTab, setActiveTab] = useState<"flashcards" | "quiz" | "chat">("flashcards");
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);

  // Check if API key is in environment on mount
  useEffect(() => {
    fetch("/api/config-status")
      .then((res) => res.json())
      .then((data) => setApiKeyConfigured(data.configured))
      .catch((err) => {
        console.error("Failed to fetch API key status:", err);
        setApiKeyConfigured(false);
      });
  }, []);

  const handleUploadSuccess = (docId: string, guide: Omit<StudyGuide, "documentId">) => {
    setDocumentId(docId);
    setStudyGuide(guide);
    setActiveTab("flashcards");
  };

  const handleResetWorkspace = () => {
    setDocumentId(null);
    setStudyGuide(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col selection:bg-indigo-500/30 selection:text-slate-900">
      {/* Visual background ambient gradient glow */}
      <div className="absolute top-0 left-0 right-0 h-[450px] bg-gradient-to-b from-indigo-500/5 via-transparent to-transparent pointer-events-none" />

      {/* Corporate Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg shadow-indigo-600/10">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-slate-800 flex items-center gap-1.5">
                StudyGenie <span className="text-xs bg-indigo-500/10 text-indigo-600 border border-indigo-400/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">AI</span>
              </h1>
              <p className="text-[10px] text-slate-400">Active Recall & Contextual RAG Space</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {documentId && (
              <button
                onClick={handleResetWorkspace}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg transition-all cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Upload New
              </button>
            )}

            <div className="flex items-center space-x-1.5 text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              <span className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse mr-0.5" />
              <span>Sandbox Server Active</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main body area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 relative">
        
        {/* Guard warning statement if key is not configured in Secrets panel */}
        {apiKeyConfigured === false && (
          <div className="max-w-xl mx-auto mb-6 bg-amber-500/10 border border-amber-500/20 text-amber-800 p-4 rounded-xl text-xs sm:text-sm flex gap-3 leading-relaxed">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block">No API Key Configured</span>
              <p>
                To generate materials or chat, please navigate to the **Settings &gt; Secrets** panel in Google AI Studio and configure/activate your **GEMINI_API_KEY**. Once customized, reload your workspace to trigger action!
              </p>
            </div>
          </div>
        )}

        {!documentId || !studyGuide ? (
          /* Drag and drop panel */
          <div className="py-8 space-y-12">
            <div className="text-center space-y-3 max-w-2xl mx-auto">
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-800 font-sans sm:leading-tight">
                Accelerate Learning with <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-indigo-500">Automated Study Packs</span>
              </h2>
              <p className="text-sm sm:text-base text-slate-500 leading-relaxed animate-fade-in">
                Unlock instant retrieval. Simply drag textbook materials or handwriting snapshots onto our engine to trigger automated OCR, active-recall card boards, ten-question quizzes, and a document-pinned brain bot.
              </p>
            </div>

            <UploadSection onUploadSuccess={handleUploadSuccess} />

            {/* Visual core values explanation section - Bento Layout */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto pt-8 border-t border-slate-200">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 transition-all hover:shadow-md hover:border-slate-300">
                <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-lg w-max border border-indigo-100">
                  <FileText className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">Active Recall Cards</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  3D flipping perspective boards structured directly onto chapter vocabulary themes to reinforce conceptual primacy and retrieve memory.
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 transition-all hover:shadow-md hover:border-slate-300">
                <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-lg w-max border border-indigo-100">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">Interactive Quiz</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Exactly 10 concept-focused MCQs, providing automatic scoring and full clarification breakdowns describing incorrect choices.
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 transition-all hover:shadow-md hover:border-slate-300">
                <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-lg w-max border border-indigo-100">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-slate-800">Semantic Document RAG</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Ask definitions or formula breakdowns and watch our embedding pipeline query contextual chunks to answer queries without hallucinations.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Active studying station space */
          <div className="space-y-8 animate-fade-in">
            
            {/* Context title panel */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
              <div className="space-y-2 flex-1">
                <span className="text-[10px] uppercase tracking-widest font-extrabold text-indigo-600 bg-indigo-50 border border-indigo-150 px-2.5 py-1 rounded-md">
                  Active Workspace
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-800">
                  {studyGuide.title}
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
                  {studyGuide.summary}
                </p>
              </div>

              <button
                onClick={handleResetWorkspace}
                className="bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-slate-600 font-semibold text-xs py-2.5 px-4 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Analyze Another
              </button>
            </div>

            {/* Tabs toggle panel */}
            <div className="flex border-b border-slate-200 gap-4 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setActiveTab("flashcards")}
                className={`flex items-center gap-2 py-3 px-1 text-sm font-bold border-b-2 transition-all cursor-pointer -mb-px shrink-0 p-1 ${
                  activeTab === "flashcards"
                    ? "border-indigo-600 text-indigo-605 text-indigo-600 font-extrabold"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                <FileText className="h-4 w-4" /> Recall Flashcards
              </button>

              <button
                onClick={() => setActiveTab("quiz")}
                className={`flex items-center gap-2 py-3 px-1 text-sm font-bold border-b-2 transition-all cursor-pointer -mb-px shrink-0 p-1 ${
                  activeTab === "quiz"
                    ? "border-indigo-600 text-indigo-605 text-indigo-600 font-extrabold"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                <CheckCircle2 className="h-4 w-4" /> Chapter Quiz (10)
              </button>

              <button
                onClick={() => setActiveTab("chat")}
                className={`flex items-center gap-2 py-3 px-1 text-sm font-bold border-b-2 transition-all cursor-pointer -mb-px shrink-0 p-1 ${
                  activeTab === "chat"
                    ? "border-indigo-600 text-indigo-605 text-indigo-600 font-extrabold"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                <MessageSquare className="h-4 w-4" /> Document Brain Bot
              </button>
            </div>

            {/* Dynamic tool renders with Bento Design Frame */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-6 min-h-[420px] relative">
              {activeTab === "flashcards" && (
                <FlashcardDeck cards={studyGuide.flashcards} />
              )}
              {activeTab === "quiz" && (
                <QuizComponent quiz={studyGuide.quiz} />
              )}
              {activeTab === "chat" && (
                <Chatbot key={documentId} documentId={documentId} documentTitle={studyGuide.title} />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer credits block */}
      <footer className="border-t border-slate-200 py-6 bg-white text-center text-xs text-slate-505 text-slate-500 select-none font-medium mt-16">
        <p>© 2026 StudyGenie AI Space. Crafted with exquisite Bento Grid aesthetic styles.</p>
      </footer>
    </div>
  );
}
