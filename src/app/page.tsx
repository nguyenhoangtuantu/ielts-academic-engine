'use client';

import React, { useState, useMemo } from 'react';
import { SideBySideView, SentenceItem } from '../components/diff/SideBySideView';
import { splitSentences } from '../core/diff/sentenceSplitter';
import { computeWordDiff } from '../core/diff/myersDiff';
import { Sparkles, BookOpen, CheckCircle2, BookmarkPlus, ArrowRight } from 'lucide-react';

const INITIAL_ESSAY = `In modern society, many people think that environment pollution is getting worse every day. Governments must have important roles to solve the problem about plastic waste. If citizens don't change their habit, our children will suffer many terrible consequences. Therefore, we should take immediate actions to protect the Earth before it is too late.`;

const PRESET_KNOWLEDGE: Record<string, { band65: string; band75: string; tags: string[]; explanation: string }> = {
  "in modern society, many people think that environment pollution is getting worse every day.": {
    band65: "In modern society, many people believe that environmental pollution is becoming increasingly severe.",
    band75: "In contemporary society, it is widely argued that environmental degradation has intensified at an unprecedented rate.",
    tags: ["word-formation", "collocation", "academic-tone"],
    explanation: "'environment pollution' must use the adjective form 'environmental pollution'. In Band 7.5+, 'environmental degradation' and 'intensified at an unprecedented rate' reflect sophisticated C1/C2 academic lexical resource."
  },
  "governments must have important roles to solve the problem about plastic waste.": {
    band65: "Governments must play a vital role in tackling the issue of plastic waste.",
    band75: "Governments bear a paramount responsibility to implement stringent regulatory frameworks combating plastic waste.",
    tags: ["collocation", "preposition"],
    explanation: "Standard academic collocation is 'play a vital role in doing something', not 'have roles to solve about'. 'Bear a paramount responsibility' elevates the academic register."
  },
  "if citizens don't change their habit, our children will suffer many terrible consequences.": {
    band65: "If citizens do not alter their habits, future generations will face severe consequences.",
    band75: "Unless the general public adopts sustainable lifestyle practices, future generations will inevitably face severe ecological fallout.",
    tags: ["informal-contraction", "noun-number", "collocation"],
    explanation: "Avoid informal contractions like 'don't' in academic IELTS writing. 'Habit' should be plural 'habits'. 'Ecological fallout' demonstrates domain-specific precision."
  },
  "therefore, we should take immediate actions to protect the earth before it is too late.": {
    band65: "Therefore, immediate action should be taken to preserve the planet before irreparable harm occurs.",
    band75: "Consequently, comprehensive remedial measures must be enacted expeditiously to avert irreversible planetary degradation.",
    tags: ["passive-voice", "lexical-upgrade"],
    explanation: "Shifting from first-person 'we should' to impersonal/passive voice ('action should be taken') significantly increases academic objectivity."
  }
};

export default function HomePage() {
  const [essayText, setEssayText] = useState(INITIAL_ESSAY);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [savedMistakes, setSavedMistakes] = useState<Array<{ sentenceId: number; text: string; tags: string[] }>>([]);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Compute word count
  const wordCount = useMemo(() => {
    return essayText.trim().split(/\s+/).filter(Boolean).length;
  }, [essayText]);

  // Compute sentences dynamically
  const parsedSentences = useMemo<SentenceItem[]>(() => {
    const rawSentences = splitSentences(essayText);
    return rawSentences.map((raw, idx) => {
      const sentenceId = idx + 1;
      const normalized = raw.trim().toLowerCase();

      // Check preset knowledge base or build smart heuristic upgrade
      const matched = PRESET_KNOWLEDGE[normalized];
      if (matched) {
        return {
          sentence_id: sentenceId,
          original: raw.trim(),
          band_65: matched.band65,
          band_75: matched.band75,
          diff_65: computeWordDiff(raw.trim(), matched.band65),
          diff_75: computeWordDiff(raw.trim(), matched.band75),
          error_tags: matched.tags,
          explanation: matched.explanation,
        };
      }

      // Heuristic enhancement for custom sentences
      let b65 = raw.trim();
      let b75 = raw.trim();
      const tags: string[] = [];

      if (/\bdon't\b/i.test(b65) || /\bcan't\b/i.test(b65)) {
        b65 = b65.replace(/\bdon't\b/gi, 'do not').replace(/\bcan't\b/gi, 'cannot');
        b75 = b75.replace(/\bdon't\b/gi, 'fail to').replace(/\bcan't\b/gi, 'are incapable of');
        tags.push('formal-register');
      }

      if (/\ba lot of\b/i.test(b65)) {
        b65 = b65.replace(/\ba lot of\b/gi, 'numerous');
        b75 = b75.replace(/\ba lot of\b/gi, 'a substantial proportion of');
        tags.push('lexical-resource');
      }

      if (tags.length === 0) {
        tags.push('sentence-structure');
      }

      return {
        sentence_id: sentenceId,
        original: raw.trim(),
        band_65: b65,
        band_75: b75,
        diff_65: computeWordDiff(raw.trim(), b65),
        diff_75: computeWordDiff(raw.trim(), b75),
        error_tags: tags,
        explanation: 'Review sentence structure and vocabulary precision to align with IELTS Band 7+ descriptors.',
      };
    });
  }, [essayText]);

  const handleEvaluate = () => {
    setIsEvaluating(true);
    setTimeout(() => {
      setIsEvaluating(false);
    }, 400);
  };

  const handleSaveMistake = (mistake: { sentenceId: number; errorTags: string[]; original: string; revised: string }) => {
    const exists = savedMistakes.some((m) => m.sentenceId === mistake.sentenceId);
    if (!exists) {
      setSavedMistakes((prev) => [
        ...prev,
        { sentenceId: mistake.sentenceId, text: mistake.original, tags: mistake.errorTags },
      ]);
      setSaveSuccessMsg(`Đã lưu câu #${mistake.sentenceId} vào Ngân hàng lỗi sai (SM-2 Spaced Repetition)`);
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Navigation Header */}
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 bg-clip-text text-transparent">
                IELTS Academic Engine
              </span>
              <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-slate-500">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Myers Diff & SM-2 Ready</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-semibold text-slate-500">Gói hiện tại</span>
              <span className="text-xs font-bold text-blue-600">Miễn phí (1 lượt/ngày)</span>
            </div>
            <button
              type="button"
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all rounded-xl shadow-sm shadow-blue-600/30 flex items-center space-x-1.5"
            >
              <span>Nâng cấp Pro 49k</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Hero Section */}
        <div className="text-center sm:text-left space-y-2">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            Chấm & Sửa bài IELTS Writing Tự Động Chi Tiết Từng Câu
          </h1>
          <p className="text-sm text-slate-600 max-w-3xl">
            Không viết lại toàn bộ bài gây mất giọng văn của bạn. Hệ thống sử dụng thuật toán Myers Diff so sánh song song từng câu, đưa ra 2 lựa chọn an toàn (Band 6.5) và học thuật chuyên sâu (Band 7.5+), tự động lưu lỗi sai vào Sổ tay ôn tập ngắt quãng (SM-2).
          </p>
        </div>

        {/* Input Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <BookOpen className="w-4 h-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Bài luận của bạn (IELTS Writing Task 2)
              </h2>
            </div>
            <div className="flex items-center space-x-3 text-xs">
              <span className={`font-semibold px-2.5 py-1 rounded-full ${
                wordCount >= 250 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}>
                {wordCount} / 250 từ chuẩn
              </span>
              <span className="text-slate-400 font-medium">
                {parsedSentences.length} câu
              </span>
            </div>
          </div>

          <textarea
            value={essayText}
            onChange={(e) => setEssayText(e.target.value)}
            rows={5}
            placeholder="Dán bài văn IELTS Writing Task 2 của bạn vào đây..."
            className="w-full p-4 text-sm text-slate-800 bg-slate-50/50 hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all leading-relaxed font-sans"
          />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <label className="flex items-center space-x-2 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                defaultChecked
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
              />
              <span className="flex items-center space-x-1">
                <span>Đóng góp bài viết (đã ẩn danh) vào Thư viện học thuật để dùng lượt chấm miễn phí.</span>
                <span className="text-slate-400 font-normal">[🔒 Chế độ Riêng tư - Gói Pro]</span>
              </span>
            </label>

            <button
              type="button"
              onClick={handleEvaluate}
              disabled={isEvaluating || !essayText.trim()}
              className="w-full sm:w-auto px-7 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isEvaluating ? 'Đang phân tích từng câu...' : 'Chấm & Phân Tích Myers Diff'}</span>
            </button>
          </div>
        </div>

        {/* Success Alert */}
        {saveSuccessMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl flex items-center space-x-2 text-xs font-semibold shadow-xs animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}

        {/* Stats Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 block">Ước lượng Band hiện tại</span>
            <span className="text-xl font-black text-amber-600">Band 6.0</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 block">Mục tiêu nâng cấp</span>
            <span className="text-xl font-black text-emerald-600">Band 7.5+</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 block">Số câu phân tích</span>
            <span className="text-xl font-black text-blue-600">{parsedSentences.length} câu</span>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
            <span className="text-xs font-semibold text-slate-500 block">Lỗi đã lưu vào Sổ tay</span>
            <span className="text-xl font-black text-indigo-600">{savedMistakes.length} lỗi</span>
          </div>
        </div>

        {/* Side-by-Side Diff Component Section */}
        <section className="space-y-4">
          <SideBySideView
            sentences={parsedSentences}
            defaultBand="6.5"
            onSaveMistake={handleSaveMistake}
          />
        </section>

        {/* Saved Mistakes Bank Section */}
        {savedMistakes.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <BookmarkPlus className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  Sổ tay Lỗi sai Cá nhân (Mistake Bank - SM-2)
                </h3>
              </div>
              <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                {savedMistakes.length} câu cần ôn tập
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {savedMistakes.map((m) => (
                <div key={m.sentenceId} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700">Câu #{m.sentenceId}</span>
                    <div className="flex gap-1">
                      {m.tags.map((t, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-semibold text-[10px]">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-slate-600 italic">"{m.text}"</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
