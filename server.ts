/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * StudyGenie AI — Express Backend
 * Backend/AI Challenge Features:
 *  - Supabase pgvector for persistent RAG vector storage (falls back to in-memory)
 *  - Exponential-backoff retry on all Gemini API calls
 *  - Server-Sent Events (SSE) for real-time upload progress
 *  - Streaming chat responses via SSE using generateContentStream
 *  - Top-5 chunk retrieval with cosine similarity threshold filtering
 *  - Fixed model names: gemini-2.0-flash + gemini-embedding-2-preview
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Set high limits for textbook PDFs or rich note images in base64
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ============================================================
// Data Structures
// ============================================================

interface StoredPack {
  documentId: string;
  title: string;
  summary: string;
  flashcards: Array<{ front: string; back: string }>;
  quiz: Array<{ question: string; options: string[]; correctAnswer: string; explanation: string }>;
  // In-memory chunk store — always populated as fallback
  chunks: Array<{ text: string; embedding?: number[] }>;
  // Whether chunks were also persisted to Supabase
  supabaseIndexed: boolean;
}

type ProgressEmitter = (step: string, index: number, total: number) => void;

// In-memory session store (metadata + fallback vectors)
const studyStore = new Map<string, StoredPack>();

// SSE progress channel map: sessionId → write callback
const progressChannels = new Map<string, ProgressEmitter>();

// ============================================================
// Lazy-loaded Clients
// ============================================================

let _aiInstance: GoogleGenAI | null = null;
let _supabaseInstance: SupabaseClient | null | false = null; // false = checked but not configured

function getAiClient(): GoogleGenAI {
  if (!_aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not configured. Please add your Gemini API key to Settings > Secrets."
      );
    }
    _aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });
  }
  return _aiInstance;
}

function getSupabaseClient(): SupabaseClient | null {
  if (_supabaseInstance === false) return null; // already checked, not configured
  if (_supabaseInstance) return _supabaseInstance;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key || url.includes("YOUR_PROJECT_ID")) {
    console.log("[Supabase] Not configured — using in-memory vector fallback.");
    _supabaseInstance = false;
    return null;
  }

  console.log("[Supabase] Connecting to", url);
  _supabaseInstance = createClient(url, key);
  return _supabaseInstance;
}

// ============================================================
// Utilities
// ============================================================

/**
 * Exponential-backoff retry wrapper.
 * Retries `fn` up to `maxRetries` times with doubling delay.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 800
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt === maxRetries) break;
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[Retry ${attempt + 1}/${maxRetries}] ${err?.message || err} — waiting ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/**
 * Cosine similarity between two equal-length float vectors.
 * Used as in-memory RAG fallback when Supabase is not configured.
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA.length || vecA.length !== vecB.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Set standard SSE headers on a response and flush.
 */
function setupSSE(res: express.Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no", // Disable nginx buffering
  });
  res.flushHeaders();
}

/**
 * Write a single SSE data frame.
 */
function sseWrite(res: express.Response, payload: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// ============================================================
// API Routes
// ============================================================

// --- Config status ---
app.get("/api/config-status", (_req, res) => {
  const supabase = getSupabaseClient();
  res.json({
    configured: !!process.env.GEMINI_API_KEY,
    supabaseConfigured: !!supabase,
    vectorMode: supabase ? "supabase-pgvector" : "in-memory-cosine",
  });
});

// --- SSE Upload Progress Channel ---
// The frontend opens this EventSource before submitting the upload,
// then the upload handler emits steps into this channel.
app.get("/api/upload-progress/:sessionId", (req, res) => {
  const { sessionId } = req.params;

  setupSSE(res);

  // Register emitter for this session
  const emitter: ProgressEmitter = (step, index, total) => {
    sseWrite(res, { step, index, total });
  };
  progressChannels.set(sessionId, emitter);

  // Send an immediate heartbeat so EventSource knows it's connected
  sseWrite(res, { step: "Connected — waiting for upload...", index: 0, total: 8 });

  // Cleanup on client disconnect
  req.on("close", () => {
    progressChannels.delete(sessionId);
  });
});

// --- Document Upload & Study Pack Generation ---
app.post("/api/upload-document", async (req, res) => {
  const { fileData, fileName, mimeType, sessionId } = req.body;

  if (!fileData || !mimeType) {
    res.status(400).json({ error: "Missing file data or mimeType in request." });
    return;
  }

  // Helper to broadcast progress to the SSE channel (if open)
  const STEPS = [
    "Sending to Gemini Vision multimodal model...",
    "Extracting text, formulas & structure...",
    "Generating active-recall flashcards...",
    "Building 10-question concept quiz...",
    "Slicing document into semantic chunks...",
    "Computing embedding vectors via Gemini...",
    "Indexing into vector store...",
    "Finalising study pack...",
  ];
  const broadcast = (stepIdx: number) => {
    const emit = sessionId ? progressChannels.get(sessionId as string) : null;
    if (emit) emit(STEPS[stepIdx], stepIdx + 1, STEPS.length);
    console.log(`[Upload] Step ${stepIdx + 1}/${STEPS.length}: ${STEPS[stepIdx]}`);
  };

  try {
    const ai = getAiClient();
    const supabase = getSupabaseClient();

    broadcast(0); // Sending to Gemini Vision

    // --- Multimodal extraction ---
    const inlinePart = { inlineData: { mimeType, data: fileData } };

    const promptText = `Analyze this uploaded document comprehensively. Extract all key concepts, math formulas (LaTeX: $inline$ or $$block$$), code blocks, tables, and handwritten notes accurately.

Return a JSON Study Pack with exactly these fields:
1. "title" — concise educational title.
2. "summary" — dense 150-250 word summary of main themes and concepts.
3. "flashcards" — 8 to 12 active-recall cards. front = clear question. back = detailed answer. Include LaTeX formulas where relevant.
4. "quiz" — EXACTLY 10 multiple-choice questions. Each has: "question", "options" (EXACTLY 4 items), "correctAnswer" (must EXACTLY match one option), "explanation" (why the answer is correct).
5. "chunks" — 6 to 10 factual knowledge paragraphs (200-500 words each). These form the RAG knowledge base — include verbatim facts, formulas, definitions, arguments directly from the source. Do NOT invent or add external knowledge.`;

    broadcast(1); // Extracting

    const geminiResponse = await withRetry(() =>
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [inlinePart, promptText],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              summary: { type: Type.STRING },
              flashcards: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    front: { type: Type.STRING },
                    back: { type: Type.STRING },
                  },
                  required: ["front", "back"],
                },
              },
              quiz: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctAnswer: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                  },
                  required: ["question", "options", "correctAnswer", "explanation"],
                },
              },
              chunks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "6-10 factual paragraphs for RAG vector indexing.",
              },
            },
            required: ["title", "summary", "flashcards", "quiz", "chunks"],
          },
        },
      })
    );

    const parsedData = JSON.parse(geminiResponse.text || "{}");
    const documentId = "doc_" + crypto.randomUUID();
    const chunksRaw: string[] = parsedData.chunks || [];

    broadcast(2); // Flashcards
    broadcast(3); // Quiz
    broadcast(4); // Chunking

    // --- Generate embeddings in parallel (with per-chunk retry) ---
    broadcast(5); // Embedding

    // Sequential embedding (not parallel) to stay within RPM rate limits
    const embeddingResults: Array<{ text: string; embedding: number[]; chunkIndex: number }> = [];
    for (let idx = 0; idx < chunksRaw.length; idx++) {
      const text = chunksRaw[idx];
      try {
        const embedRes = await withRetry(() =>
          ai.models.embedContent({
            model: "gemini-embedding-2",
            contents: text,
          })
        );
        embeddingResults.push({
          text,
          embedding: (embedRes.embeddings?.[0]?.values as number[]) || [],
          chunkIndex: idx,
        });
        // Small delay between embeddings to respect RPM limits
        if (idx < chunksRaw.length - 1) await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.error(`[Embed] Chunk ${idx} failed:`, err);
        embeddingResults.push({ text, embedding: [] as number[], chunkIndex: idx });
      }
    }

    broadcast(6); // Indexing into vector store

    // --- Persist to Supabase (if configured) ---
    let supabaseIndexed = false;
    if (supabase) {
      const rows = embeddingResults
        .filter((c) => c.embedding.length > 0)
        .map((c) => ({
          document_id: documentId,
          chunk_index: c.chunkIndex,
          content: c.text,
          // pgvector expects a string representation: '[0.1, 0.2, ...]'
          embedding: `[${c.embedding.join(",")}]`,
        }));

      if (rows.length > 0) {
        const { error } = await supabase.from("document_chunks").insert(rows);
        if (error) {
          console.error("[Supabase] Insert error (will use in-memory fallback):", error.message);
        } else {
          supabaseIndexed = true;
          console.log(`[Supabase] Indexed ${rows.length} chunks for ${documentId}`);
        }
      }
    }

    broadcast(7); // Finalising

    // --- Store session data in memory ---
    const pack: StoredPack = {
      documentId,
      title: parsedData.title || "Study Guide Pack",
      summary: parsedData.summary || "",
      flashcards: parsedData.flashcards || [],
      quiz: parsedData.quiz || [],
      chunks: embeddingResults.map((c) => ({ text: c.text, embedding: c.embedding })),
      supabaseIndexed,
    };

    studyStore.set(documentId, pack);

    // Signal SSE channel that upload is fully done
    const finishEmit = sessionId ? progressChannels.get(sessionId as string) : null;
    if (finishEmit) {
      finishEmit("✅ Study pack ready!", STEPS.length, STEPS.length);
    }

    res.json({
      success: true,
      documentId,
      vectorMode: supabaseIndexed ? "supabase-pgvector" : "in-memory-cosine",
      studyGuide: {
        title: pack.title,
        summary: pack.summary,
        flashcards: pack.flashcards,
        quiz: pack.quiz,
      },
    });
  } catch (err: any) {
    console.error("[Upload] Fatal error:", err);
    const errMsg = err.message || "Unknown error while processing document.";
    // Detect quota / rate-limit errors and return a clean human-readable message
    if (errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota")) {
      res.status(429).json({
        error: "⚠️ Gemini API quota exceeded. The free tier allows ~15 requests per minute and 1,500 per day. Please wait 60 seconds and try again, or get a paid API key at https://aistudio.google.com/apikey"
      });
    } else {
      res.status(500).json({ error: errMsg });
    }
  }
});

// --- Streaming Chat Endpoint (SSE) ---
// Uses generateContentStream so tokens arrive progressively.
app.post("/api/chat-stream", async (req, res) => {
  const { documentId, message, history } = req.body;

  if (!documentId || !message) {
    res.status(400).json({ error: "Missing documentId or message." });
    return;
  }

  const pack = studyStore.get(documentId as string);
  if (!pack) {
    res.status(404).json({
      error: "Study pack not found. The session may have expired — please upload your document again.",
    });
    return;
  }

  try {
    const ai = getAiClient();
    const supabase = getSupabaseClient();

    // 1. Embed the user's query
    let queryEmbedding: number[] = [];
    try {
      const embedRes = await withRetry(() =>
        ai.models.embedContent({
          model: "gemini-embedding-2",
          contents: message as string,
        })
      );
      queryEmbedding = (embedRes.embeddings?.[0]?.values as number[]) || [];
    } catch (err) {
      console.warn("[Chat] Query embedding failed — will use first chunks:", err);
    }

    // 2. Retrieve top-5 relevant chunks
    let relevantSnippets: string[] = [];

    // --- Strategy A: Supabase pgvector ANN search ---
    if (supabase && pack.supabaseIndexed && queryEmbedding.length > 0) {
      try {
        const { data, error } = await supabase.rpc("match_documents", {
          query_embedding: queryEmbedding,
          match_document_id: documentId,
          match_count: 5,
          match_threshold: 0.25,
        });

        if (error) {
          console.warn("[Supabase RPC] Error, falling back to in-memory:", error.message);
        } else if (data && data.length > 0) {
          relevantSnippets = (data as Array<{ content: string; similarity: number }>).map(
            (row) => row.content
          );
          console.log(`[RAG] Supabase returned ${relevantSnippets.length} chunks`);
        }
      } catch (err) {
        console.warn("[Supabase RPC] Exception, falling back:", err);
      }
    }

    // --- Strategy B: In-memory cosine similarity (fallback) ---
    if (relevantSnippets.length === 0) {
      if (queryEmbedding.length > 0) {
        const SCORE_THRESHOLD = 0.2;
        const scored = pack.chunks
          .map((ck) => ({
            text: ck.text,
            score: ck.embedding?.length ? cosineSimilarity(queryEmbedding, ck.embedding) : 0,
          }))
          .filter((c) => c.score >= SCORE_THRESHOLD)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);

        relevantSnippets = scored.map((c) => c.text);
        console.log(
          `[RAG] In-memory cosine: ${relevantSnippets.length} chunks (threshold ${SCORE_THRESHOLD})`
        );
      }

      // Last resort: use first 3 chunks
      if (relevantSnippets.length === 0) {
        relevantSnippets = pack.chunks.slice(0, 3).map((c) => c.text);
        console.log("[RAG] Using first 3 chunks as fallback context");
      }
    }

    const mergedContext = relevantSnippets.join("\n---\n");

    // 3. Build system instruction constraining bot to document facts only
    const systemInstruction = `You are StudyGenie — a helpful AI study assistant trained exclusively on the uploaded document: "${pack.title}".

The following are the highest-scoring semantic context segments retrieved from the document:
═══════════════════════════════════════════
${mergedContext}
═══════════════════════════════════════════

STRICT RULES YOU MUST FOLLOW:
1. Answer ONLY using facts, definitions, equations, and notes explicitly present in the context above. Never add external knowledge.
2. If the question cannot be answered from the provided context, respond with: "The uploaded study material doesn't contain information about that. Please ask about topics covered in your document."
3. Format all mathematical expressions using LaTeX:
   - Inline: $expression$ (e.g., $E = mc^2$)
   - Display block: $$expression$$ (e.g., $$\\int_0^\\infty e^{-x} dx = 1$$)
4. Format code using proper markdown fenced code blocks with language specifiers (e.g., \`\`\`python).
5. Use bullet points, numbered lists, and bold headings to structure detailed answers clearly.
6. Be concise but thorough. Prioritize clarity for a student studying for an exam.`;

    // 4. Set SSE response headers
    setupSSE(res);

    // 5. Map conversation history
    interface HistoryMsg { role: "user" | "assistant"; content: string; }
    const safeHistory: HistoryMsg[] = Array.isArray(history) ? history : [];
    const contents = [
      ...safeHistory.map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      })),
      { role: "user", parts: [{ text: message as string }] },
    ];

    // 6. Stream tokens from Gemini
    const streamResult = await withRetry(() =>
      ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents,
        config: {
          systemInstruction,
          temperature: 0.15, // Low temperature to reduce hallucinations
          maxOutputTokens: 2048,
        },
      })
    );

    for await (const chunk of streamResult) {
      const text = chunk.text;
      if (text) {
        sseWrite(res, { token: text });
      }
    }

    sseWrite(res, { done: true });
    res.end();
  } catch (err: any) {
    console.error("[Chat Stream] Error:", err);
    const errMsg = err.message || "Failed to process chat response.";
    const isQuota = errMsg.includes("429") || errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("quota");
    const cleanMsg = isQuota
      ? "⚠️ Gemini API quota exceeded. Please wait 60 seconds before sending another message."
      : errMsg;
    if (!res.headersSent) {
      res.status(isQuota ? 429 : 500).json({ error: cleanMsg });
    } else {
      sseWrite(res, { error: cleanMsg });
      res.end();
    }
  }
});

// --- Legacy non-streaming chat (kept for compatibility) ---
app.post("/api/chat-document", async (req, res) => {
  try {
    const { documentId, message, history } = req.body;
    if (!documentId || !message) {
      res.status(400).json({ error: "Missing documentId or message." });
      return;
    }
    const pack = studyStore.get(documentId as string);
    if (!pack) {
      res.status(404).json({ error: "Study pack not found." });
      return;
    }

    const ai = getAiClient();
    let queryEmbedding: number[] = [];
    try {
      const embedRes = await withRetry(() =>
        ai.models.embedContent({ model: "gemini-embedding-2", contents: message as string })
      );
      queryEmbedding = (embedRes.embeddings?.[0]?.values as number[]) || [];
    } catch (_) {}

    let snippets: string[] = [];
    if (queryEmbedding.length > 0) {
      const scored = pack.chunks
        .map((ck) => ({
          text: ck.text,
          score: ck.embedding?.length ? cosineSimilarity(queryEmbedding, ck.embedding) : 0,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      snippets = scored.map((c) => c.text);
    } else {
      snippets = pack.chunks.slice(0, 3).map((c) => c.text);
    }

    interface HistoryMsg { role: "user" | "assistant"; content: string; }
    const safeHistory: HistoryMsg[] = Array.isArray(history) ? history : [];
    const contents = [
      ...safeHistory.map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      })),
      { role: "user", parts: [{ text: message as string }] },
    ];

    const result = await withRetry(() =>
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          systemInstruction: `You are an educational AI constrained to: "${pack.title}".\n\nContext:\n${snippets.join("\n---\n")}\n\nOnly answer from the context above. Use LaTeX ($...$) for math.`,
          temperature: 0.15,
        },
      })
    );
    res.json({ response: result.text || "Unable to formulate a response." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Chat error." });
  }
});

// ============================================================
// Vite Dev / Production Server
// ============================================================
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    const supabase = getSupabaseClient();
    console.log(`[StudyGenie] Server running at http://localhost:${PORT}`);
    console.log(`[StudyGenie] Vector mode: ${supabase ? "Supabase pgvector" : "In-memory cosine similarity"}`);
    console.log(`[StudyGenie] Gemini API: ${process.env.GEMINI_API_KEY ? "Configured ✓" : "NOT CONFIGURED ✗"}`);
  });
}

startServer();
