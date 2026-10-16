import { useState, useEffect, useCallback, useRef } from 'react';
import type { SentenceItem } from '../components/diff/SideBySideView';

export type StreamStatus = 'idle' | 'streaming' | 'completed' | 'error';

export interface UseEssayStreamResult {
  sentences: SentenceItem[];
  status: StreamStatus;
  error: string | null;
  totalSentences: number;
  reconnect: () => void;
  close: () => void;
}

export function useEssayStream(jobId: string | null | undefined): UseEssayStreamResult {
  const [sentences, setSentences] = useState<SentenceItem[]>([]);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [totalSentences, setTotalSentences] = useState<number>(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const [reconnectKey, setReconnectKey] = useState(0);

  const close = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const reconnect = useCallback(() => {
    close();
    setReconnectKey((prev) => prev + 1);
  }, [close]);

  useEffect(() => {
    if (!jobId) {
      setStatus('idle');
      setSentences([]);
      setError(null);
      setTotalSentences(0);
      close();
      return;
    }

    setStatus('streaming');
    setError(null);
    setSentences([]);
    setTotalSentences(0);

    const streamUrl = `/api/essays/stream/${encodeURIComponent(jobId)}`;
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    const handleSentenceDiff = (event: MessageEvent) => {
      try {
        const payload: SentenceItem =
          typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

        setSentences((prev) => {
          const index = prev.findIndex((s) => s.sentence_id === payload.sentence_id);
          let next: SentenceItem[];
          if (index >= 0) {
            next = [...prev];
            next[index] = payload;
          } else {
            next = [...prev, payload];
          }
          return next.sort((a, b) => a.sentence_id - b.sentence_id);
        });
      } catch (err) {
        console.error('Failed to parse sentence_diff SSE payload', err);
      }
    };

    const handleCompleted = (event: MessageEvent) => {
      try {
        const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (payload?.sentences && Array.isArray(payload.sentences)) {
          setSentences(payload.sentences);
        }
        if (payload?.totalSentences !== undefined) {
          setTotalSentences(payload.totalSentences);
        }
      } catch (err) {
        console.error('Failed to parse completed SSE payload', err);
      } finally {
        setStatus('completed');
        close();
      }
    };

    const handleError = (event: any) => {
      let message = 'Stream connection error';
      if (event && event.data) {
        try {
          const parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          message = parsed.message || parsed.error || event.data;
        } catch {
          message = event.data;
        }
      } else if (event && event.message) {
        message = event.message;
      }
      setError(message);
      setStatus('error');
      close();
    };

    es.addEventListener('sentence_diff', handleSentenceDiff as EventListener);
    es.addEventListener('completed', handleCompleted as EventListener);
    es.addEventListener('error', handleError as EventListener);
    es.onerror = handleError as (event: Event) => void;

    return () => {
      es.removeEventListener('sentence_diff', handleSentenceDiff as EventListener);
      es.removeEventListener('completed', handleCompleted as EventListener);
      es.removeEventListener('error', handleError as EventListener);
      es.close();
      if (eventSourceRef.current === es) {
        eventSourceRef.current = null;
      }
    };
  }, [jobId, reconnectKey, close]);

  return {
    sentences,
    status,
    error,
    totalSentences: totalSentences || sentences.length,
    reconnect,
    close,
  };
}
