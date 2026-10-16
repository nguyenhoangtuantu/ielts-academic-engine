'use client';

import React, { useState } from 'react';
import { SideBySideView, SentenceItem } from '../components/diff/SideBySideView';

const SAMPLE_SENTENCES: SentenceItem[] = [
  {
    sentence_id: 1,
    original: "In modern society, many people think that environment pollution is getting worse every day.",
    band_65: "In modern society, many people believe that environmental pollution is becoming increasingly severe.",
    band_75: "In contemporary society, it is widely argued that environmental degradation has intensified at an unprecedented rate.",
    error_tags: ["word-formation", "collocation", "academic-tone"],
    explanation: "'environment pollution' should use the adjective form 'environmental pollution'. In Band 7.5+, 'environmental degradation' and 'intensified at an unprecedented rate' demonstrate sophisticated academic vocabulary."
  },
  {
    sentence_id: 2,
    original: "Governments must have important roles to solve the problem about plastic waste.",
    band_65: "Governments must play a vital role in tackling the issue of plastic waste.",
    band_75: "Governments bear a paramount responsibility to implement stringent regulatory frameworks combating plastic waste.",
    error_tags: ["collocation", "preposition"],
    explanation: "We say 'play a role in doing something', not 'have roles to solve about'. 'Bear a paramount responsibility' elevates the register significantly."
  },
  {
    sentence_id: 3,
    original: "If citizens don't change their habit, our children will suffer many terrible consequences.",
    band_65: "If citizens do not alter their habits, future generations will face severe consequences.",
    band_75: "Unless the general public adopts sustainable lifestyle practices, future generations will inevitably face severe ecological fallout.",
    error_tags: ["informal-contraction", "noun-number", "collocation"],
    explanation: "Avoid contractions like 'don't' in academic IELTS writing. 'Habit' should be plural 'habits'. 'Ecological fallout' provides domain-specific precision."
  }
];

export default function HomePage() {
  const [essayText, setEssayText] = useState(
    "In modern society, many people think that environment pollution is getting worse every day. Governments must have important roles to solve the problem about plastic waste. If citizens don't change their habit, our children will suffer many terrible consequences."
  );
  const [sentences, setSentences] = useState<SentenceItem[]>(SAMPLE_SENTENCES);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [savedMistakes, setSavedMistakes] = useState<string[]>([]);

  const handleEvaluate = () => {
    setIsEvaluating(true);
    // Simulate streaming / evaluation response for local demo
    setTimeout(() => {
      setSentences(SAMPLE_SENTENCES);
      setIsEvaluating(false);
    }, 600);
  };

  const handleSaveMistake = (mistake: { sentenceId: number; errorTags: string[] }) => {
    const key = `Sentence ${mistake.sentenceId}: [${mistake.errorTags.join(', ')}]`;
    if (!savedMistakes.includes(key)) {
      setSavedMistakes(prev => [...prev, key]);
    }
  };

  return (
    <main className="min-h-screen py-10 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Top Banner */}
      <header className="mb-8 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between border-b border-neutral-200 pb-6 gap-4">
        <div>
          <div className="flex items-center space-x-2 justify-center sm:justify-start">
            <span className="px-2.5 py-1 text-xs font-bold bg-blue-100 text-blue-700 rounded-full uppercase tracking-wider">
              IELTS Writing AI v1.0
            </span>
            <span className="px-2.5 py-1 text-xs font-bold bg-green-100 text-green-700 rounded-full">
              Myers Diff & SM-2 Engine
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-neutral-900 tracking-tight mt-2">
            Academic Sentence Evaluation & Interactive Diff
          </h1>
          <p className="text-sm text-neutral-600 mt-1 max-w-2xl">
            Detailed sentence-by-sentence analysis without full-essay rewriting. Choose between safe Band 6.5 and advanced Band 7.5+ alternatives.
          </p>
        </div>

        {/* Pro Badge */}
        <div className="flex items-center space-x-3 bg-white p-3 rounded-2xl shadow-sm border border-neutral-200">
          <div className="text-right">
            <div className="text-xs font-semibold text-neutral-500">Subscription</div>
            <div className="text-sm font-bold text-blue-600">Free Tier (1 check/day)</div>
          </div>
          <button
            type="button"
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-sm"
          >
            Upgrade 49k Pro
          </button>
        </div>
      </header>

      {/* Input Section */}
      <section className="bg-white p-6 rounded-2xl shadow-sm border border-neutral-200 mb-8">
        <div className="flex items-center justify-between mb-3">
          <label htmlFor="essay-input" className="text-sm font-bold text-neutral-900">
            Paste IELTS Writing Task 2 Essay:
          </label>
          <span className="text-xs text-neutral-500">
            {essayText.trim().split(/\s+/).filter(Boolean).length} words
          </span>
        </div>
        <textarea
          id="essay-input"
          value={essayText}
          onChange={(e) => setEssayText(e.target.value)}
          rows={4}
          className="w-full p-3.5 text-sm text-neutral-800 border border-neutral-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all font-mono"
          placeholder="Paste your essay here..."
        />

        <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-3">
          <label className="flex items-center space-x-2 text-xs text-neutral-600 cursor-pointer">
            <input type="checkbox" defaultChecked className="rounded text-blue-600 focus:ring-blue-500" />
            <span>
              Đóng góp bài viết (đã ẩn danh) vào Thư viện học thuật cộng đồng để nhận lượt chấm miễn phí.
            </span>
          </label>

          <button
            type="button"
            onClick={handleEvaluate}
            disabled={isEvaluating}
            className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl shadow-sm transition-all disabled:opacity-50"
          >
            {isEvaluating ? 'Evaluating with AI & Myers Diff...' : 'Chấm & Sửa bài ngay'}
          </button>
        </div>
      </section>

      {/* Side-by-Side Diff Component View */}
      <section className="mb-8">
        <SideBySideView
          sentences={sentences}
          defaultBand="6.5"
          onSaveMistake={handleSaveMistake}
        />
      </section>

      {/* Mistake Bank Notification */}
      {savedMistakes.length > 0 && (
        <aside className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <h3 className="text-sm font-bold text-emerald-900 flex items-center space-x-2">
            <span>📚 Saved to Mistake Bank (SM-2 Spaced Repetition):</span>
          </h3>
          <ul className="mt-2 text-xs text-emerald-800 list-disc list-inside space-y-1">
            {savedMistakes.map((m, idx) => (
              <li key={idx}>{m}</li>
            ))}
          </ul>
        </aside>
      )}
    </main>
  );
}
