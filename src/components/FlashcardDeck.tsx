/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2, RotateCcw, Shuffle, Sparkles, HelpCircle } from "lucide-react";
import { Flashcard } from "../types";

interface FlashcardDeckProps {
  cards: Flashcard[];
}

export const FlashcardDeck: React.FC<FlashcardDeckProps> = ({ cards: initialCards }) => {
  const [cards, setCards] = useState<Flashcard[]>([...initialCards]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [masteredIds, setMasteredIds] = useState<Set<number>>(new Set());
  const [filterMastered, setFilterMastered] = useState(false);

  if (initialCards.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Sparkles className="h-8 w-8 mx-auto mb-3 text-slate-600" />
        <p>No study cards generated yet. Upload a document to start studying.</p>
      </div>
    );
  }

  // Handle building indexes when we filter mastered cards
  const activeIndices = cards
    .map((_, idx) => idx)
    .filter((idx) => !filterMastered || !masteredIds.has(idx));

  const currentActiveIndexIndex = activeIndices.indexOf(currentIndex);
  const currentCard = cards[currentIndex];

  const handleNext = () => {
    if (activeIndices.length <= 1) {
      setIsFlipped(false);
      return;
    }
    setIsFlipped(false);
    setTimeout(() => {
      const nextIdxInActive = (currentActiveIndexIndex + 1) % activeIndices.length;
      setCurrentIndex(activeIndices[nextIdxInActive]);
    }, 200);
  };

  const handlePrev = () => {
    if (activeIndices.length <= 1) {
      setIsFlipped(false);
      return;
    }
    setIsFlipped(false);
    setTimeout(() => {
      const prevIdxInActive = (currentActiveIndexIndex - 1 + activeIndices.length) % activeIndices.length;
      setCurrentIndex(activeIndices[prevIdxInActive]);
    }, 200);
  };

  const handleToggleMastered = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent card flip when marking mastered
    const nextMastered = new Set(masteredIds);
    if (nextMastered.has(idx)) {
      nextMastered.delete(idx);
    } else {
      nextMastered.add(idx);
      // Automatically advance card if there are more
      if (activeIndices.length > 1) {
        handleNext();
      }
    }
    setMasteredIds(nextMastered);
  };

  const handleShuffle = () => {
    setIsFlipped(false);
    setTimeout(() => {
      const shuffled = [...cards].sort(() => Math.random() - 0.5);
      setCards(shuffled);
      setCurrentIndex(0);
      setMasteredIds(new Set());
    }, 200);
  };

  const handleResetLearning = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setMasteredIds(new Set());
      setCurrentIndex(0);
    }, 200);
  };

  // Safe checks if no active cards match current filters
  const hasItems = activeIndices.length > 0;

  return (
    <div className="space-y-6 sm:space-y-8 max-w-2xl mx-auto py-2">
      {/* Deck Toolbar Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-255 border-slate-200 pb-4">
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span>📇</span> Active Recall Deck
          </h3>
          <p className="text-xs text-slate-455 text-slate-500">
            Click cards to flip. Mark cards as mastered to narrow your study focus.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Mastered toggle */}
          <button
            onClick={() => {
              setIsFlipped(false);
              setFilterMastered(!filterMastered);
              setCurrentIndex(0);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              filterMastered
                ? "bg-emerald-50 text-emerald-600 border-emerald-300"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            Hide Mastered ({masteredIds.size})
          </button>

          <button
            onClick={handleShuffle}
            title="Randomize card order"
            className="p-1.5 bg-white hover:bg-slate-55 hover:bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-800 rounded-lg transition-all cursor-pointer"
          >
            <Shuffle className="h-4 w-4" />
          </button>

          <button
            onClick={handleResetLearning}
            title="Reset progress"
            className="p-1.5 bg-white hover:bg-slate-55 hover:bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-800 rounded-lg transition-all cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {hasItems && currentCard ? (
        <div className="space-y-6 sm:space-y-8 flex flex-col items-center">
          {/* Progress indicators */}
          <div className="flex items-center justify-between w-full text-xs text-slate-500 max-w-lg font-medium">
            <span>
              Card {currentActiveIndexIndex + 1} of {activeIndices.length} active
            </span>
            <span className="text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 border border-indigo-150 rounded-md">
              {Math.round((masteredIds.size / cards.length) * 100)}% Mastered
            </span>
          </div>

          {/* Interactive Core Flipping Card Structure */}
          <div
            id={`flashcard-${currentIndex}`}
            className="w-full max-w-lg h-72 sm:h-80 perspective-1000 cursor-pointer group relative"
            onClick={() => setIsFlipped(!isFlipped)}
          >
            {/* Mock 3D Card Stack backgrounds behind actual interactive wrapper */}
            <div className="absolute inset-0 bg-slate-100 border border-slate-200/60 rounded-2xl transform translate-y-3 scale-95 transition-transform duration-300 pointer-events-none" />
            <div className="absolute inset-0 bg-slate-50 border border-slate-255 border-slate-150/60 rounded-2xl transform translate-y-1.5 scale-[0.975] transition-transform duration-300 pointer-events-none" />

            <div
              className={`relative w-full h-full duration-500 transition-transform preserve-3d ${
                isFlipped ? "rotate-y-180" : ""
              }`}
            >
              {/* Card Front Component */}
              <div className="absolute inset-0 bg-white border border-slate-200 shadow-sm rounded-2xl flex flex-col justify-between p-6 sm:p-8 backface-hidden">
                <div className="flex justify-between items-center text-xs font-bold text-indigo-600 uppercase tracking-widest">
                  <span className="flex items-center gap-1.5">
                    <HelpCircle className="h-3.5 w-3.5" /> QUESTION
                  </span>
                  <button
                    onClick={(e) => handleToggleMastered(currentIndex, e)}
                    className={`p-1.5 rounded-full text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all cursor-pointer ${
                      masteredIds.has(currentIndex) ? "text-emerald-600 bg-emerald-50" : ""
                    }`}
                    title="Mark as mastered"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex-1 flex items-center justify-center py-4">
                  <p className="text-base sm:text-lg font-bold text-slate-800 text-center leading-relaxed">
                    {currentCard.front}
                  </p>
                </div>

                <div className="text-center text-[10px] text-indigo-600 font-bold italic uppercase tracking-wider select-none animate-pulse">
                  Click card to reveal explanation
                </div>
              </div>

              {/* Card Back Component */}
              <div className="absolute inset-0 bg-indigo-50/95 border border-indigo-200 shadow-md rounded-2xl flex flex-col justify-between p-6 sm:p-8 backface-hidden rotate-y-180">
                <div className="flex justify-between items-center text-xs font-bold text-emerald-600 uppercase tracking-widest">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> RECALL ANSWER
                  </span>
                  <button
                    onClick={(e) => handleToggleMastered(currentIndex, e)}
                    className={`p-1.5 rounded-full transition-all cursor-pointer ${
                      masteredIds.has(currentIndex)
                        ? "text-emerald-600 bg-emerald-50"
                        : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                    }`}
                    title="Mark as mastered"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex-1 flex items-center justify-center overflow-y-auto py-2 pr-1 custom-scrollbar">
                  <p className="text-sm sm:text-base text-indigo-950 font-medium text-center leading-relaxed">
                    {currentCard.back}
                  </p>
                </div>

                <div className="text-center text-[10px] text-indigo-505 text-indigo-500 italic uppercase tracking-wider select-none">
                  Click card to flip questions
                </div>
              </div>
            </div>
          </div>

          {/* Navigational Controls */}
          <div className="flex items-center space-x-6">
            <button
              onClick={handlePrev}
              disabled={activeIndices.length <= 1}
              className="p-3 bg-white border border-slate-200 hover:border-slate-300 text-slate-605 text-slate-600 disabled:opacity-30 disabled:hover:scale-100 hover:scale-105 active:scale-95 rounded-xl transition-all cursor-pointer shadow-sm"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <span className="text-sm font-semibold text-slate-500 select-none">
              Card {currentActiveIndexIndex + 1} of {activeIndices.length}
            </span>

            <button
              onClick={handleNext}
              disabled={activeIndices.length <= 1}
              className="p-3 bg-white border border-slate-200 hover:border-slate-300 text-slate-605 text-slate-600 disabled:opacity-30 disabled:hover:scale-100 hover:scale-105 active:scale-95 rounded-xl transition-all cursor-pointer shadow-sm"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 bg-emerald-50/50 border border-emerald-100 rounded-2xl p-6">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4 animate-bounce" />
          <h4 className="text-lg font-bold text-slate-800 mb-1">Pristine Study Session Completed!</h4>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            You have marked all cards in this flashcard study package as mastered! Excellent active-recall retrieval practice.
          </p>

          <div className="flex justify-center gap-3">
            <button
              onClick={() => {
                setFilterMastered(false);
                setCurrentIndex(0);
              }}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2.5 rounded-xl font-semibold transition-all cursor-pointer shadow-sm shadow-indigo-600/10"
            >
              Review All Cards
            </button>
            <button
              onClick={handleShuffle}
              className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-605 text-slate-655 text-slate-600 text-xs px-4 py-2.5 rounded-xl font-semibold transition-all cursor-pointer shadow-sm"
            >
              Reset & Shuffle Deck
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
