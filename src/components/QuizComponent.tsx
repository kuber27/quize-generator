/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Check, X, AlertCircle, HelpCircle, ArrowLeft, ArrowRight, RotateCcw, Award } from "lucide-react";
import { QuizQuestion } from "../types";

interface QuizComponentProps {
  quiz: QuizQuestion[];
}

export const QuizComponent: React.FC<QuizComponentProps> = ({ quiz }) => {
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: number]: string }>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [showFullWorksheet, setShowFullWorksheet] = useState(false);

  if (quiz.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <HelpCircle className="h-8 w-8 mx-auto mb-3 text-slate-600 animate-pulse" />
        <p>No quiz questions available. Please upload a study study document first.</p>
      </div>
    );
  }

  const handleOptionSelect = (qIdx: number, option: string) => {
    if (submitted) return;
    setSelectedAnswers((prev) => ({
      ...prev,
      [qIdx]: option,
    }));
  };

  const calculateScore = () => {
    let finalScore = 0;
    quiz.forEach((q, idx) => {
      if (selectedAnswers[idx] === q.correctAnswer) {
        finalScore += 1;
      }
    });
    setScore(finalScore);
    setSubmitted(true);
  };

  const handleRetake = () => {
    setSelectedAnswers({});
    setSubmitted(false);
    setScore(0);
    setActiveQuestion(0);
  };

  const answeredCount = Object.keys(selectedAnswers).length;
  const isAllAnswered = answeredCount === quiz.length;

  const renderQuestionBox = (item: QuizQuestion, qIdx: number) => {
    return (
      <div
        key={qIdx}
        className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3 font-sans">
          <span className="bg-indigo-50 text-indigo-600 border border-indigo-200 text-xs px-2.5 py-1 rounded-md font-bold tracking-wider shrink-0 mt-0.5">
            Q {qIdx + 1}
          </span>
          <p className="text-sm sm:text-base font-bold text-slate-800 leading-relaxed flex-1">
            {item.question}
          </p>
        </div>

        {/* 4 Multi-Choice Option Cards */}
        <div className="grid grid-cols-1 gap-3 pt-2">
          {item.options.map((option, oIdx) => {
            const isSelected = selectedAnswers[qIdx] === option;
            const isCorrect = option === item.correctAnswer;
            
            let btnClass = "border-slate-200 bg-white text-slate-600 hover:border-slate-350 hover:bg-slate-50";
            let indicator = null;

            if (isSelected) {
              btnClass = "border-indigo-650 border-indigo-600 bg-indigo-50/40 text-indigo-700 font-semibold ring-2 ring-indigo-600/10";
            }

            if (submitted) {
              if (isCorrect) {
                 btnClass = "border-emerald-300 bg-emerald-50 text-emerald-805 text-emerald-800 font-bold";
                 indicator = <Check className="h-4 w-4 text-emerald-600 shrink-0" />;
              } else if (isSelected) {
                 btnClass = "border-rose-300 bg-rose-50 text-rose-805 text-rose-800 line-through decoration-rose-550/50";
                 indicator = <X className="h-4 w-4 text-rose-600 shrink-0" />;
              } else {
                 btnClass = "border-slate-100 bg-slate-50/50 text-slate-400 cursor-not-allowed opacity-60";
              }
            }

            return (
              <button
                key={oIdx}
                disabled={submitted}
                onClick={() => handleOptionSelect(qIdx, option)}
                className={`flex items-center justify-between gap-3 px-4 py-3 border text-left rounded-xl text-xs sm:text-sm transition-all duration-150 cursor-pointer ${btnClass}`}
              >
                <span className="leading-snug">{option}</span>
                {indicator}
              </button>
            );
          })}
        </div>

        {/* Detailed Explanation Drop */}
        {submitted && (
          <div className="bg-indigo-50/60 border border-indigo-150 rounded-xl p-4 flex gap-3 text-xs sm:text-sm text-indigo-900 leading-normal animate-fade-in mt-4">
            <AlertCircle className="h-5 w-5 text-indigo-550 text-indigo-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="text-indigo-650 text-indigo-600 font-extrabold block select-none uppercase tracking-widest text-[10px]">
                Concept Breakdown
              </span>
              <p className="leading-relaxed font-medium">{item.explanation}</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-2xl mx-auto py-2">
      {/* Quiz Header & Scoreboard */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span>📝</span> Dynamic Chapter Quiz
          </h3>
          <p className="text-xs text-slate-505 text-slate-500">
            10 multiple choice assessment questions compiled from your chapter.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowFullWorksheet(!showFullWorksheet)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-all cursor-pointer"
          >
            {showFullWorksheet ? "Stepped View" : "Full Sheet View"}
          </button>
          
          {submitted && (
            <button
              onClick={handleRetake}
              className="p-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-505 text-slate-500 hover:text-slate-800 rounded-lg transition-all cursor-pointer"
              title="Retake assessment"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {submitted && (
        <div className="bg-indigo-50 border border-indigo-150 rounded-2xl p-5 text-center space-y-3 shadow-sm">
          <Award className="h-8 w-8 text-indigo-600 mx-auto animate-pulse" />
          <h4 className="text-base font-bold text-slate-800">Assessment Results</h4>
          <div className="space-y-1">
            <p className="text-2xl font-extrabold text-indigo-650 text-indigo-600">
              {score} / {quiz.length} Correct
            </p>
            <div className="flex justify-center flex-wrap gap-4 text-xs font-semibold">
              <span className="text-emerald-600">{score} Correct</span>
              <span className="text-rose-600">{answeredCount - score} Incorrect</span>
              <span className="text-amber-600">{quiz.length - answeredCount} Unanswered</span>
            </div>
          </div>
          <p className="text-xs text-slate-505 text-slate-500 max-w-sm mx-auto leading-relaxed">
            {score >= 8
              ? "Primacy recall confirmed! You exhibit a strong grasp of the uploaded concepts."
              : "Review the breakdowns below and retake the quiz to maximize semantic consolidation."}
          </p>
        </div>
      )}

      {showFullWorksheet ? (
        /* WorkSheet Scroll Map */
        <div className="space-y-6">
          {quiz.map((item, qIdx) => renderQuestionBox(item, qIdx))}

          {!submitted && (
            <button
              onClick={calculateScore}
              className="w-full py-3.5 px-4 rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/10 hover:shadow-indigo-500/20"
            >
              Submit Assessment Worksheet ({answeredCount}/{quiz.length} Answered)
            </button>
          )}
        </div>
      ) : (
        /* Stepped Slide Map */
        <div className="space-y-6">
          {/* Question step progress indicator */}
          <div className="flex items-center justify-between text-xs text-slate-400 overflow-x-auto gap-1 pb-1 scrollbar-thin">
            {quiz.map((_, qIdx) => {
              const isSelected = selectedAnswers[qIdx] !== undefined;
              let dotStyle = "bg-slate-100 hover:bg-slate-200 text-slate-500";
              if (activeQuestion === qIdx) dotStyle = "bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-500/10 scale-110";
              else if (submitted) {
                const answerIsCorrect = selectedAnswers[qIdx] === quiz[qIdx].correctAnswer;
                dotStyle = answerIsCorrect ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-rose-50 text-rose-600 border border-rose-200";
              } else if (isSelected) {
                dotStyle = "bg-indigo-50 text-indigo-650 border border-indigo-150";
              }

              return (
                <button
                  key={qIdx}
                  onClick={() => setActiveQuestion(qIdx)}
                  className={`flex-1 min-w-[28px] h-7 rounded-md font-bold transition-all text-[11px] cursor-pointer ${dotStyle}`}
                >
                  {qIdx + 1}
                </button>
              );
            })}
          </div>

          {renderQuestionBox(quiz[activeQuestion], activeQuestion)}

          {/* Stepper Footer Controls */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setActiveQuestion((prev) => Math.max(0, prev - 1))}
              disabled={activeQuestion === 0}
              className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-4 py-2.5 text-xs sm:text-sm font-semibold disabled:opacity-30 rounded-xl transition-all cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" /> Previous
            </button>

            {!submitted && activeQuestion === quiz.length - 1 ? (
              <button
                onClick={calculateScore}
                className="flex items-center gap-1.5 font-bold text-xs sm:text-sm px-6 py-2.5 rounded-xl text-white transition-all cursor-pointer bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/10"
              >
                Submit ({answeredCount}/{quiz.length})
              </button>
            ) : (
              <button
                onClick={() => setActiveQuestion((prev) => Math.min(quiz.length - 1, prev + 1))}
                disabled={activeQuestion === quiz.length - 1}
                className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-4 py-2.5 text-xs sm:text-sm font-semibold disabled:opacity-30 rounded-xl transition-all cursor-pointer"
              >
                Next <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
