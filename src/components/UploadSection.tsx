/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * UploadSection — supports PDF and photo uploads with real SSE progress
 */

import React, { useState, useRef } from "react";
import {
  Upload, FileText, ImageIcon, AlertCircle, Sparkles,
  CheckCircle2, RefreshCw, Clock, Camera,
} from "lucide-react";
import { UploadResponse } from "../types";

interface UploadSectionProps {
  onUploadSuccess: (documentId: string, studyGuide: any) => void;
}

type FileMode = "pdf" | "image" | null;

export const UploadSection: React.FC<UploadSectionProps> = ({ onUploadSuccess }) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileMode, setFileMode] = useState<FileMode>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(8);
  const [currentStepText, setCurrentStepText] = useState("Initialising...");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isQuotaError, setIsQuotaError] = useState(false);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // ── Drag & Drop ──────────────────────────────────────────────
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setError(null);
    if (e.dataTransfer.files?.[0]) validateAndSetFile(e.dataTransfer.files[0]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (e.target.files?.[0]) validateAndSetFile(e.target.files[0]);
    // Reset input so same file can be re-selected after a clear
    e.target.value = "";
  };

  const validateAndSetFile = (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const isPdf = file.type === "application/pdf" || ext === "pdf";
    const isImg =
      file.type.startsWith("image/") ||
      ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff"].includes(ext);

    if (isPdf) {
      setSelectedFile(file);
      setFileMode("pdf");
      setDone(false);
      setError(null);
      setIsQuotaError(false);
    } else if (isImg) {
      setSelectedFile(file);
      setFileMode("image");
      setDone(false);
      setError(null);
      setIsQuotaError(false);
    } else {
      setError("Unsupported file type. Please upload a PDF or an image (PNG, JPEG, WebP, etc.).");
    }
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
    setFileMode(null);
    setError(null);
    setIsQuotaError(false);
  };

  // ── Base64 helper ─────────────────────────────────────────────
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
    });

  // ── MIME type resolver ────────────────────────────────────────
  const resolveMimeType = (file: File): string => {
    if (file.type) return file.type;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const map: Record<string, string> = {
      pdf: "application/pdf",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      bmp: "image/bmp",
    };
    return map[ext] || "application/octet-stream";
  };

  // ── Upload handler ────────────────────────────────────────────
  const handleProcessSubmit = async () => {
    if (!selectedFile) return;

    setLoading(true);
    setError(null);
    setIsQuotaError(false);
    setDone(false);
    setLoadingStep(0);
    setCurrentStepText("Connecting to analysis engine...");

    const sessionId = crypto.randomUUID();

    // Open SSE channel BEFORE posting upload so no steps are missed
    const es = new EventSource(`/api/upload-progress/${sessionId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { step: string; index: number; total: number };
        setCurrentStepText(data.step);
        setLoadingStep(Math.max(0, data.index - 1));
        setTotalSteps(data.total);
        if (data.step.includes("ready") || data.index >= data.total) {
          setDone(true);
          es.close();
        }
      } catch { /* ignore malformed frames */ }
    };

    es.onerror = () => es.close();

    try {
      const base64Data = await fileToBase64(selectedFile);
      const mimeType = resolveMimeType(selectedFile);

      const response = await fetch("/api/upload-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileData: base64Data,
          fileName: selectedFile.name,
          mimeType,
          sessionId,
        }),
      });

      const result: UploadResponse & { error?: string; vectorMode?: string } = await response.json();

      if (!response.ok || !result.success) {
        // Detect quota error by HTTP status or message content
        const isQuota =
          response.status === 429 ||
          (result.error || "").includes("quota") ||
          (result.error || "").includes("RESOURCE_EXHAUSTED");
        setIsQuotaError(isQuota);
        throw new Error(result.error || "The server failed to process this document.");
      }

      es.close();
      onUploadSuccess(result.documentId, result.studyGuide);
    } catch (err: any) {
      es.close();
      console.error("[Upload]", err);
      setError(err.message || "An unexpected error occurred. Check your API configuration.");
    } finally {
      setLoading(false);
      eventSourceRef.current = null;
    }
  };

  const progressPercent = totalSteps > 0 ? ((loadingStep + 1) / totalSteps) * 100 : 0;

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-xl mx-auto bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden p-6 sm:p-8 space-y-6">

      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center bg-indigo-50 text-indigo-600 p-3 rounded-full mb-2 border border-indigo-100">
          <Sparkles className="h-6 w-6 animate-pulse" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Upload Study Material</h2>
        <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
          Upload a textbook chapter <strong>(PDF)</strong> or a photo of your <strong>handwritten notes</strong>.
          Gemini will extract, embed, and generate your active study pack.
        </p>
      </div>

      {!loading ? (
        <div className="space-y-5">

          {/* Two-button selector: PDF | Photo */}
          <div className="grid grid-cols-2 gap-3">
            {/* PDF button */}
            <button
              type="button"
              onClick={() => pdfInputRef.current?.click()}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                fileMode === "pdf"
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 bg-slate-50 text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/40"
              }`}
            >
              <FileText className={`h-7 w-7 ${fileMode === "pdf" ? "text-indigo-600" : "text-slate-400"}`} />
              <span className="text-xs font-bold uppercase tracking-wider">PDF Document</span>
              <span className="text-[10px] text-slate-400">Textbook, notes, slides</span>
            </button>

            {/* Photo button */}
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                fileMode === "image"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-500 hover:border-emerald-300 hover:bg-emerald-50/40"
              }`}
            >
              <Camera className={`h-7 w-7 ${fileMode === "image" ? "text-emerald-600" : "text-slate-400"}`} />
              <span className="text-xs font-bold uppercase tracking-wider">Photo / Image</span>
              <span className="text-[10px] text-slate-400">Handwritten notes, whiteboard</span>
            </button>
          </div>

          {/* Hidden file inputs */}
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Drop zone (also shows selected file) */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-all ${
              dragActive
                ? "border-indigo-400 bg-indigo-50/40 scale-[1.01]"
                : selectedFile
                ? fileMode === "image"
                  ? "border-emerald-300 bg-emerald-50/30"
                  : "border-indigo-300 bg-indigo-50/30"
                : "border-slate-200 bg-slate-50/50 hover:border-slate-300"
            }`}
          >
            {selectedFile ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {fileMode === "image" ? (
                    <div className="p-2 bg-emerald-100 rounded-lg shrink-0">
                      <ImageIcon className="h-6 w-6 text-emerald-600" />
                    </div>
                  ) : (
                    <div className="p-2 bg-indigo-100 rounded-lg shrink-0">
                      <FileText className="h-6 w-6 text-indigo-600" />
                    </div>
                  )}
                  <div className="min-w-0 text-left">
                    <p className="text-sm font-semibold text-slate-800 truncate">{selectedFile.name}</p>
                    <p className="text-xs text-slate-500">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB ·{" "}
                      <span className={fileMode === "image" ? "text-emerald-600 font-semibold" : "text-indigo-600 font-semibold"}>
                        {fileMode === "image" ? "📷 Photo ready" : "📄 PDF ready"}
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={clearFile}
                  className="shrink-0 text-xs text-slate-400 hover:text-rose-500 px-2 py-1 rounded-lg hover:bg-rose-50 transition-all"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-2">
                <Upload className="h-6 w-6 text-slate-300" />
                <p className="text-xs text-slate-400">
                  Or drag &amp; drop any PDF or image here
                </p>
              </div>
            )}
          </div>

          {/* Error display */}
          {error && (
            <div className={`flex items-start p-4 rounded-xl text-xs sm:text-sm space-x-3 ${
              isQuotaError
                ? "bg-amber-50 border border-amber-200 text-amber-900"
                : "bg-rose-50 border border-rose-200 text-rose-800"
            }`}>
              {isQuotaError ? (
                <Clock className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
              )}
              <div className="leading-relaxed space-y-2">
                <span className="font-bold block">
                  {isQuotaError ? "⚠️ API Quota Exceeded" : "Extraction Issue"}
                </span>
                <p>{error}</p>
                {isQuotaError && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      onClick={() => { setError(null); setIsQuotaError(false); }}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg transition-all cursor-pointer"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Dismiss &amp; Retry
                    </button>
                    <a
                      href="https://aistudio.google.com/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all"
                    >
                      Get Free API Key ↗
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Generate button */}
          {selectedFile && !error && (
            <button
              id="generate-study-pack-btn"
              onClick={handleProcessSubmit}
              className={`w-full font-semibold py-3 px-4 rounded-xl text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer text-white active:scale-[0.99] ${
                fileMode === "image"
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : "bg-indigo-600 hover:bg-indigo-500"
              }`}
            >
              <Sparkles className="h-4 w-4" />
              {fileMode === "image" ? "Analyse Handwritten Notes" : "Generate Study Pack"}
            </button>
          )}

          {selectedFile && error && isQuotaError && (
            <button
              onClick={handleProcessSubmit}
              className="w-full font-semibold py-3 px-4 rounded-xl text-sm bg-slate-700 hover:bg-slate-600 text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" /> Try Again
            </button>
          )}
        </div>
      ) : (
        /* Loading state with SSE-driven real progress */
        <div className="bg-gradient-to-b from-slate-50 to-white p-8 rounded-xl border border-slate-200 text-center space-y-6">
          <div className="relative h-16 w-16 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 border-4 border-slate-100 rounded-full" />
            <div
              className={`absolute inset-0 border-4 rounded-full ${
                done
                  ? "border-emerald-500"
                  : "border-t-indigo-600 border-r-indigo-400 border-b-transparent border-l-transparent animate-spin"
              }`}
            />
            {done ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            ) : (
              <Sparkles className="h-5 w-5 text-indigo-500 animate-pulse" />
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-800">
              {done ? "Study Pack Ready!" : fileMode === "image" ? "Analysing Handwritten Notes" : "Analysing Study Content"}
            </h3>
            <div className="h-10 flex items-center justify-center">
              <p className={`text-xs px-4 leading-normal max-w-sm font-semibold transition-all duration-300 ${
                done ? "text-emerald-600" : "text-indigo-600 animate-pulse"
              }`}>
                {currentStepText}
              </p>
            </div>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ease-out ${done ? "bg-emerald-500" : "bg-indigo-600"}`}
              style={{ width: `${Math.min(100, progressPercent)}%` }}
            />
          </div>

          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
            Step {Math.min(loadingStep + 1, totalSteps)} of {totalSteps}
          </p>
        </div>
      )}
    </div>
  );
};
