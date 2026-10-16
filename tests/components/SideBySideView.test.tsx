// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DiffSentenceRow } from '../../src/components/diff/DiffSentenceRow';
import { ErrorPopover } from '../../src/components/diff/ErrorPopover';
import { SideBySideView } from '../../src/components/diff/SideBySideView';
import { useEssayStream } from '../../src/hooks/useEssayStream';

// Mock EventSource for useEssayStream tests
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  listeners: Record<string, ((event: any) => void)[]> = {};
  onerror: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: any) => void) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event: any) => void) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter(l => l !== listener);
    }
  }

  emit(type: string, data: any) {
    const event = { type, data: typeof data === 'string' ? data : JSON.stringify(data) };
    if (this.listeners[type]) {
      this.listeners[type].forEach(l => l(event));
    }
    if (type === 'message' && this.onmessage) {
      this.onmessage(event);
    }
  }

  emitError(errorData?: any) {
    const event = { type: 'error', data: errorData ? (typeof errorData === 'string' ? errorData : JSON.stringify(errorData)) : undefined };
    if (this.listeners['error']) {
      this.listeners['error'].forEach(l => l(event));
    }
    if (this.onerror) {
      this.onerror(event);
    }
  }

  close() {
    this.readyState = 2;
  }
}

describe('DiffSentenceRow', () => {
  it('renders deleted words with strikethrough red and added words with green', () => {
    const chunks = [
      { type: 'delete' as const, value: 'have' },
      { type: 'insert' as const, value: 'face' }
    ];
    render(<DiffSentenceRow sentenceId={1} original="have" revised="face" diffChunks={chunks} />);
    expect(screen.getByText('have').className).toContain('text-red');
    expect(screen.getByText('face').className).toContain('text-green');
  });

  it('renders equal chunks with neutral text and opens popover on interaction', () => {
    const chunks = [
      { type: 'equal' as const, value: 'Many students ' },
      { type: 'delete' as const, value: 'have' },
      { type: 'insert' as const, value: 'face' },
      { type: 'equal' as const, value: ' challenges.' }
    ];
    const onSave = vi.fn();
    render(
      <DiffSentenceRow
        sentenceId={2}
        original="Many students have challenges."
        revised="Many students face challenges."
        diffChunks={chunks}
        explanation="Use more precise academic verbs instead of generic 'have'."
        errorTags={['lexical-resource', 'collocation']}
        onSaveMistake={onSave}
      />
    );

    expect(screen.getByText(/Many students/).className).toContain('text-neutral');

    // Clicking on the deleted chunk opens the error popover
    fireEvent.click(screen.getByText('have'));
    expect(screen.getByText("Use more precise academic verbs instead of generic 'have'.")).toBeDefined();
    expect(screen.getByText('lexical-resource')).toBeDefined();

    // Clicking Save to Mistake Bank triggers callback
    fireEvent.click(screen.getByRole('button', { name: /save to mistake bank/i }));
    expect(onSave).toHaveBeenCalledWith({
      sentenceId: 2,
      original: 'Many students have challenges.',
      revised: 'Many students face challenges.',
      errorTags: ['lexical-resource', 'collocation'],
      explanation: "Use more precise academic verbs instead of generic 'have'.",
    });
  });
});

describe('ErrorPopover', () => {
  it('displays mistake explanation, tags, band alternatives, and save button', () => {
    const onBandChange = vi.fn();
    const onSave = vi.fn();
    const onClose = vi.fn();

    render(
      <ErrorPopover
        sentenceId={1}
        original="Students have pressure."
        explanation="Replace weak verb with formal academic register."
        errorTags={['lexical-resource', 'style']}
        band65="Students experience pressure."
        band75="Students encounter substantial academic pressure."
        activeBand="7.5"
        onBandChange={onBandChange}
        onSaveToMistakeBank={onSave}
        onClose={onClose}
      />
    );

    expect(screen.getByText('Replace weak verb with formal academic register.')).toBeDefined();
    expect(screen.getByText('lexical-resource')).toBeDefined();
    expect(screen.getByText('style')).toBeDefined();

    // Switch band toggle inside popover
    const band65Btn = screen.getByRole('button', { name: /band 6\.5/i });
    fireEvent.click(band65Btn);
    expect(onBandChange).toHaveBeenCalledWith('6.5');

    // Save to mistake bank button
    const saveBtn = screen.getByRole('button', { name: /save to mistake bank/i });
    fireEvent.click(saveBtn);
    expect(onSave).toHaveBeenCalledTimes(1);

    // Close button
    const closeBtn = screen.getByRole('button', { name: /close/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('SideBySideView', () => {
  const sampleSentences = [
    {
      sentence_id: 1,
      original: 'In conclusion, students have many problem.',
      band_65: 'In conclusion, students face many problems.',
      band_75: 'In conclusion, learners encounter manifold academic dilemmas.',
      diff_65: [
        { type: 'equal' as const, value: 'In conclusion, students ' },
        { type: 'delete' as const, value: 'have' },
        { type: 'insert' as const, value: 'face' },
        { type: 'equal' as const, value: ' many ' },
        { type: 'delete' as const, value: 'problem.' },
        { type: 'insert' as const, value: 'problems.' }
      ],
      diff_75: [
        { type: 'equal' as const, value: 'In conclusion, ' },
        { type: 'delete' as const, value: 'students have many problem.' },
        { type: 'insert' as const, value: 'learners encounter manifold academic dilemmas.' }
      ],
      error_tags: ['grammatical-range', 'lexical-resource'],
      explanation: 'Grammar and vocabulary need enhancement.'
    },
    {
      sentence_id: 2,
      original: 'This is because they study hard.',
      band_65: 'This is because they study diligently.',
      band_75: 'This stems from rigorous academic dedication.',
      diff_65: [
        { type: 'equal' as const, value: 'This is because they study ' },
        { type: 'delete' as const, value: 'hard.' },
        { type: 'insert' as const, value: 'diligently.' }
      ],
      diff_75: [
        { type: 'delete' as const, value: 'This is because they study hard.' },
        { type: 'insert' as const, value: 'This stems from rigorous academic dedication.' }
      ],
      error_tags: ['lexical-resource'],
      explanation: 'Use more formal causative phrasing.'
    }
  ];

  it('renders two columns for desktop and toggles between Band 6.5 and Band 7.5+', () => {
    render(<SideBySideView sentences={sampleSentences} defaultBand="6.5" />);

    // Check headings
    expect(screen.getByText(/original essay/i)).toBeDefined();
    expect(screen.getByText(/revised version/i)).toBeDefined();

    // Verify initial band 6.5 content is displayed
    expect(screen.getByText(/face/)).toBeDefined();

    // Switch to Band 7.5+
    const band75Toggle = screen.getByRole('button', { name: /band 7\.5\+/i });
    fireEvent.click(band75Toggle);

    // Revised content now displays Band 7.5+ text
    expect(screen.getByText(/learners encounter manifold academic dilemmas\./)).toBeDefined();
  });

  it('supports responsive mobile view with tab switcher', () => {
    render(<SideBySideView sentences={sampleSentences} isMobile={true} defaultBand="6.5" />);

    // Mobile view shows tab switcher
    const origTab = screen.getByRole('tab', { name: /original/i });
    const revTab = screen.getByRole('tab', { name: /revised/i });
    expect(origTab).toBeDefined();
    expect(revTab).toBeDefined();

    // Initially in mobile mode, original tab is active
    expect(screen.getByText('In conclusion, students have many problem.')).toBeDefined();

    // Switch to Revised tab
    fireEvent.click(revTab);
    expect(screen.getByText(/face/)).toBeDefined();
  });

  it('supports synchronized anchor focus per sentence ID', () => {
    // Mock scrollIntoView
    const scrollIntoViewMock = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    render(<SideBySideView sentences={sampleSentences} defaultBand="6.5" />);

    const sentence1Row = screen.getByTestId('sentence-row-original-1');
    fireEvent.click(sentence1Row);

    expect(scrollIntoViewMock).toHaveBeenCalled();
  });
});

describe('useEssayStream', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    (global as any).EventSource = MockEventSource;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connects to /api/essays/stream/:jobId and processes SSE events', async () => {
    const { result } = renderHook(() => useEssayStream('job-123'));

    expect(result.current.status).toBe('streaming');
    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toBe('/api/essays/stream/job-123');

    // Emit a sentence_diff event
    const sentencePayload = {
      sentence_id: 1,
      original: 'I has a dream.',
      band_65: 'I have a dream.',
      band_75: 'I harbor an aspiration.',
      diff_65: [
        { type: 'equal', value: 'I ' },
        { type: 'delete', value: 'has' },
        { type: 'insert', value: 'have' },
        { type: 'equal', value: ' a dream.' }
      ],
      diff_75: [
        { type: 'delete', value: 'I has a dream.' },
        { type: 'insert', value: 'I harbor an aspiration.' }
      ],
      error_tags: ['subject-verb-agreement'],
      explanation: 'Subject "I" takes "have".'
    };

    act(() => {
      MockEventSource.instances[0].emit('sentence_diff', sentencePayload);
    });

    expect(result.current.sentences.length).toBe(1);
    expect(result.current.sentences[0].original).toBe('I has a dream.');
    expect(result.current.status).toBe('streaming');

    // Emit completed event
    act(() => {
      MockEventSource.instances[0].emit('completed', {
        jobId: 'job-123',
        totalSentences: 1,
        sentences: [sentencePayload]
      });
    });

    expect(result.current.status).toBe('completed');
    expect(MockEventSource.instances[0].readyState).toBe(2); // closed
  });

  it('handles stream errors and updates error state', () => {
    const { result } = renderHook(() => useEssayStream('job-fail'));

    act(() => {
      MockEventSource.instances[0].emitError({ message: 'Evaluation job failed in queue' });
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Evaluation job failed in queue');
  });

  it('stays idle if no jobId is provided', () => {
    const { result } = renderHook(() => useEssayStream(null));
    expect(result.current.status).toBe('idle');
    expect(result.current.sentences).toEqual([]);
    expect(MockEventSource.instances.length).toBe(0);
  });
});
