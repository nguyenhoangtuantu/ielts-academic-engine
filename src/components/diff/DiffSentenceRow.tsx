'use client';

import React, { useState } from 'react';
import { ErrorPopover } from './ErrorPopover';

export interface DiffChunk {
  type: 'equal' | 'delete' | 'insert';
  value: string;
}

export interface DiffSentenceRowProps {
  sentenceId: number;
  original: string;
  revised: string;
  diffChunks: DiffChunk[];
  explanation?: string;
  errorTags?: string[];
  band65?: string;
  band75?: string;
  activeBand?: '6.5' | '7.5';
  isSelected?: boolean;
  onSelect?: (sentenceId: number) => void;
  onBandChange?: (band: '6.5' | '7.5') => void;
  onSaveMistake?: (mistake: {
    sentenceId: number;
    original: string;
    revised: string;
    errorTags: string[];
    explanation: string;
  }) => void;
}

export const DiffSentenceRow: React.FC<DiffSentenceRowProps> = ({
  sentenceId,
  original,
  revised,
  diffChunks,
  explanation,
  errorTags = [],
  band65,
  band75,
  activeBand = '6.5',
  isSelected = false,
  onSelect,
  onBandChange,
  onSaveMistake,
}) => {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const handleRowClick = () => {
    onSelect?.(sentenceId);
  };

  const handleChunkClick = (e: React.MouseEvent, type: DiffChunk['type']) => {
    e.stopPropagation();
    onSelect?.(sentenceId);
    if (type === 'delete' || type === 'insert' || explanation || errorTags.length > 0) {
      setPopoverOpen((prev) => !prev);
    }
  };

  const handleSaveToMistakeBank = () => {
    if (onSaveMistake) {
      onSaveMistake({
        sentenceId,
        original,
        revised,
        errorTags,
        explanation: explanation || '',
      });
    }
  };

  return (
    <div
      data-testid={`diff-sentence-row-${sentenceId}`}
      data-sentence-id={sentenceId}
      onClick={handleRowClick}
      className={`relative group p-2.5 my-1 rounded-lg transition-all duration-200 border cursor-pointer ${
        isSelected
          ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-100'
          : 'bg-white hover:bg-neutral-50/80 border-transparent hover:border-neutral-200'
      }`}
    >
      <div className="flex items-start space-x-2 text-base leading-relaxed">
        <span className="select-none text-xs font-mono font-medium text-neutral-400 mt-1 min-w-[1.25rem]">
          {sentenceId}.
        </span>
        <div className="flex-1">
          {diffChunks.map((chunk, idx) => {
            if (chunk.type === 'delete') {
              return (
                <span
                  key={idx}
                  onClick={(e) => handleChunkClick(e, 'delete')}
                  title="Click to view explanation"
                  className="text-red line-through bg-red-50 text-red-700 decoration-red-500 rounded px-0.5 cursor-pointer hover:bg-red-100 transition-colors"
                >
                  {chunk.value}
                </span>
              );
            }
            if (chunk.type === 'insert') {
              return (
                <span
                  key={idx}
                  onClick={(e) => handleChunkClick(e, 'insert')}
                  title="Click to view revision detail"
                  className="text-green bg-green-50 text-green-700 font-medium rounded px-0.5 cursor-pointer hover:bg-green-100 transition-colors"
                >
                  {chunk.value}
                </span>
              );
            }
            return (
              <span key={idx} className="text-neutral text-neutral-800">
                {chunk.value}
              </span>
            );
          })}
        </div>
      </div>

      {/* Popover on click/hover when feedback details exist */}
      {popoverOpen && (
        <div className="absolute left-8 top-full mt-2 z-50">
          <ErrorPopover
            sentenceId={sentenceId}
            original={original}
            revised={revised}
            explanation={explanation}
            errorTags={errorTags}
            band65={band65}
            band75={band75}
            activeBand={activeBand}
            onBandChange={onBandChange}
            onSaveToMistakeBank={onSaveMistake ? handleSaveToMistakeBank : undefined}
            onClose={() => setPopoverOpen(false)}
          />
        </div>
      )}
    </div>
  );
};
