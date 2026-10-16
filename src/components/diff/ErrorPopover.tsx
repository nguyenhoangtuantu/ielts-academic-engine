import React from 'react';

export interface ErrorPopoverProps {
  sentenceId?: number;
  original?: string;
  revised?: string;
  explanation?: string;
  errorTags?: string[];
  band65?: string;
  band75?: string;
  activeBand?: '6.5' | '7.5' | string;
  onBandChange?: (band: '6.5' | '7.5') => void;
  onSaveToMistakeBank?: () => void;
  onClose?: () => void;
}

export const ErrorPopover: React.FC<ErrorPopoverProps> = ({
  sentenceId,
  original,
  revised,
  explanation,
  errorTags = [],
  band65,
  band75,
  activeBand = '6.5',
  onBandChange,
  onSaveToMistakeBank,
  onClose,
}) => {
  return (
    <div
      role="dialog"
      aria-label="Mistake Feedback Details"
      className="error-popover relative z-50 p-4 bg-white rounded-xl shadow-2xl border border-neutral-200 text-neutral-800 w-80 max-w-sm transition-all animate-fadeIn"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-100">
        <div className="flex items-center space-x-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="font-semibold text-xs tracking-wide uppercase text-neutral-500">
            {sentenceId ? `Sentence #${sentenceId} Feedback` : 'Mistake Detail'}
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 rounded-full p-1 transition-colors text-sm font-bold"
          >
            ✕
          </button>
        )}
      </div>

      {errorTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {errorTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {explanation && (
        <p className="text-sm text-neutral-700 leading-relaxed mb-3 font-normal">
          {explanation}
        </p>
      )}

      {(band65 || band75 || onBandChange) && (
        <div className="mb-3 p-2 bg-neutral-50 rounded-lg border border-neutral-100">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-neutral-500">Band Revision Tier</span>
            <div className="inline-flex rounded-md shadow-sm" role="group">
              <button
                type="button"
                onClick={() => onBandChange?.('6.5')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-l-md transition-colors ${
                  activeBand === '6.5'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-300'
                }`}
              >
                Band 6.5
              </button>
              <button
                type="button"
                onClick={() => onBandChange?.('7.5')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-r-md transition-colors ${
                  activeBand === '7.5'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-l-0 border-neutral-300'
                }`}
              >
                Band 7.5+
              </button>
            </div>
          </div>
          {activeBand === '7.5' && band75 && (
            <p className="text-xs text-neutral-600 italic mt-1 font-serif">"{band75}"</p>
          )}
          {activeBand === '6.5' && band65 && (
            <p className="text-xs text-neutral-600 italic mt-1 font-serif">"{band65}"</p>
          )}
        </div>
      )}

      {onSaveToMistakeBank && (
        <button
          type="button"
          onClick={onSaveToMistakeBank}
          className="w-full inline-flex items-center justify-center px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500"
        >
          Save to Mistake Bank
        </button>
      )}
    </div>
  );
};
