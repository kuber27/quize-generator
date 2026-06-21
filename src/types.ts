/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Flashcard {
  front: string;
  back: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface StudyGuide {
  documentId: string;
  title: string;
  summary: string;
  flashcards: Flashcard[];
  quiz: QuizQuestion[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface UploadResponse {
  success: boolean;
  documentId: string;
  studyGuide: Omit<StudyGuide, "documentId">;
}

export interface ChunkInfo {
  text: string;
  embedding?: number[];
}
