'use client';

import React, { useState, useRef, useEffect } from 'react';
import { DiffSentenceRow, DiffChunk } from './DiffSentenceRow';
import { computeWordDiff } from '../../core/diff/myersDiff';

export interface SentenceItem {
  sentence_id: number;
  original: string;
  band_65: string;
  band_75: string;
  diff_65?: DiffChunk[];
  diff_75?: DiffChunk[];
  error_tags?: string[];
  explanation?: string;
}

export interface SideBySideViewProps {
  sentences: SentenceItem[];
  defaultBand?: '6.5' | '7.5';
  onSaveMistake?: (mistake: {
    sentenceId: number;
    original: string;
    revised: string;
    errorTags: string[];
    explanation: string;
  }) => void;
  isMobile?: boolean;
}

export const SideBySideView: React.FC<SideBySideViewProps> = ({
  sentences,
  defaultBand = '6.5',
  onSaveMistake,
  isMobile: isMobileProp,
}) => {
  const [activeBand, setActiveBand] = useState<'6.5' | '7.5'>(defaultBand);
  const [selectedSentenceId, setSelectedSentenceId] = useState<number | null>(
    sentences.length > 0 ? sentences[0].sentence_id : null
  );
  const [mobileTab, setMobileTab] = useState<'original' | 'revised'>('original');
  const [isWindowMobile, setIsWindowMobile] = useState<boolean>(false);

  // Monitor viewport width for mobile breakpoint (< 768px)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkWidth = () => {
      setIsWindowMobile(window.innerWidth < 768);
    };
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  const isMobile = isMobileProp !== undefined ? isMobileProp : isWindowMobile;

  // Refs for synchronized scrolling
  const originalRowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const revisedRowRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const handleSelectSentence = (sentenceId: number, source: 'original' | 'revised') => {
    setSelectedSentenceId(sentenceId);

    const targetMap = source === 'original' ? revisedRowRefs.current : originalRowRefs.current;
    const targetElement = targetMap.get(sentenceId);

    if (targetElement && typeof targetElement.scrollIntoView === 'function') {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  return (
    <div className="side-by-side-diff-view w-full max-w-7xl mx-auto p-4 sm:p-6 bg-neutral-50 rounded-2xl shadow-sm border border-neutral-200">
      {/* Top Header & Band Switcher */}
      <div className="flex flex-col sm:flex-row items-center justify-between pb-4 mb-6 border-b border-neutral-200 gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 tracking-tight">
            Academic Sentence Evaluation & Diff
          </h2>
          <p className="text-sm text-neutral-500 mt-0.5">
            Compare student draft against benchmark academic revisions with word-level highlights.
          </p>
        </div>

        {/* Global Band 6.5 vs Band 7.5+ Selector */}
        <div className="flex items-center space-x-2 bg-white p-1 rounded-xl shadow-xs border border-neutral-200">
          <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 pl-2">
            Target:
          </span>
          <button
            type="button"
            onClick={() => setActiveBand('6.5')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeBand === '6.5'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            Band 6.5
          </button>
          <button
            type="button"
            onClick={() => setActiveBand('7.5')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeBand === '7.5'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
          >
            Band 7.5+
          </button>
        </div>
      </div>

      {/* Mobile Tab Switcher */}
      {isMobile && (
        <div className="flex rounded-xl bg-neutral-200/80 p-1 mb-4" role="tablist" aria-label="Essay Views">
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'original'}
            onClick={() => setMobileTab('original')}
            className={`flex-1 py-2 text-xs font-bold text-center rounded-lg transition-all ${
              mobileTab === 'original'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Original
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'revised'}
            onClick={() => setMobileTab('revised')}
            className={`flex-1 py-2 text-xs font-bold text-center rounded-lg transition-all ${
              mobileTab === 'revised'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Revised
          </button>
        </div>
      )}

      {/* Main Two-Column or Single Mobile Column */}
      <div className={`grid gap-6 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
        {/* Left Column: Original Draft */}
        {(!isMobile || mobileTab === 'original') && (
          <div className="flex flex-col bg-white rounded-xl shadow-xs border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 bg-neutral-100/70 border-b border-neutral-200 flex items-center justify-between">
              <span className="font-bold text-sm text-neutral-800 tracking-wide uppercase">
                Original Essay
              </span>
              <span className="text-xs text-neutral-400 font-medium">
                {sentences.length} sentences
              </span>
            </div>
            <div className="p-3 sm:p-4 divide-y divide-neutral-100 max-h-[70vh] overflow-y-auto">
              {sentences.map((item) => {
                const isSelected = selectedSentenceId === item.sentence_id;
                return (
                  <div
                    key={item.sentence_id}
                    ref={(el) => {
                      if (el) originalRowRefs.current.set(item.sentence_id, el);
                      else originalRowRefs.current.delete(item.sentence_id);
                    }}
                    data-testid={`sentence-row-original-${item.sentence_id}`}
                    data-sentence-id={item.sentence_id}
                    onClick={() => handleSelectSentence(item.sentence_id, 'original')}
                    className={`p-2.5 my-1 rounded-lg cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-100'
                        : 'hover:bg-neutral-50/80 border border-transparent hover:border-neutral-200'
                    }`}
                  >
                    <div className="flex items-start space-x-2">
                      <span className="select-none text-xs font-mono font-medium text-neutral-400 mt-0.5 min-w-[1.25rem]">
                        {item.sentence_id}.
                      </span>
                      <p className="text-base text-neutral-800 leading-relaxed font-normal">
                        {item.original}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Right Column: Revised Version with Word Diff */}
        {(!isMobile || mobileTab === 'revised') && (
          <div className="flex flex-col bg-white rounded-xl shadow-xs border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 bg-neutral-100/70 border-b border-neutral-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm text-neutral-800 tracking-wide uppercase">
                  Revised Version
                </span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-blue-100 text-blue-800">
                  {activeBand === '6.5' ? 'Band 6.5' : 'Band 7.5+'}
                </span>
              </div>
              <span className="text-xs text-neutral-400 font-medium">Interactive Diff</span>
            </div>
            <div className="p-3 sm:p-4 divide-y divide-neutral-100 max-h-[70vh] overflow-y-auto">
              {sentences.map((item) => {
                const revisedText = activeBand === '6.5' ? item.band_65 : item.band_75;
                const explicitChunks = activeBand === '6.5' ? item.diff_65 : item.diff_75;
                const chunks =
                  explicitChunks || computeWordDiff(item.original, revisedText);

                const isSelected = selectedSentenceId === item.sentence_id;

                return (
                  <div
                    key={item.sentence_id}
                    ref={(el) => {
                      if (el) revisedRowRefs.current.set(item.sentence_id, el);
                      else revisedRowRefs.current.delete(item.sentence_id);
                    }}
                    data-testid={`sentence-row-revised-${item.sentence_id}`}
                  >
                    <DiffSentenceRow
                      sentenceId={item.sentence_id}
                      original={item.original}
                      revised={revisedText}
                      diffChunks={chunks}
                      explanation={item.explanation}
                      errorTags={item.error_tags}
                      band65={item.band_65}
                      band75={item.band_75}
                      activeBand={activeBand}
                      isSelected={isSelected}
                      onSelect={(id) => handleSelectSentence(id, 'revised')}
                      onBandChange={setActiveBand}
                      onSaveMistake={onSaveMistake}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
