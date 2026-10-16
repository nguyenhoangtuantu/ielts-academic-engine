/**
 * Word-Level Myers Diff Algorithm for IELTS Academic Feedback Engine.
 *
 * Implements Eugene Myers' O(ND) shortest edit script (SES) difference algorithm
 * at the word level while preserving whitespace and punctuation fidelity.
 *
 * Guarantees:
 * 1. Zero external dependencies.
 * 2. Strict bidirectional reconstruction invariants:
 *    - Sum of equal + delete chunks reproduces `original` exactly.
 *    - Sum of equal + insert chunks reproduces `revised` exactly.
 * 3. Chunks of identical consecutive types are always consolidated.
 */

export interface DiffChunk {
  type: "equal" | "delete" | "insert";
  value: string;
}

interface RawEdit {
  type: "equal" | "delete" | "insert";
  valA: string;
  valB: string;
}

/**
 * Tokenizes text into words, punctuation marks, and whitespace units.
 * Each token captures its subsequent trailing whitespace so that words
 * are preserved naturally without space fragmentation.
 */
function tokenize(text: string): string[] {
  if (!text) return [];
  const tokenRegex = /(?:^\s+)|(?:[\w]+(?:['’\-][\w]+)*|[^\s\w])\s*/g;
  return text.match(tokenRegex) || [];
}

/**
 * Backtracks the Myers trace history from (N, M) back to (0, 0)
 * to reconstruct the edit path.
 */
function backtrackMyers(
  trace: Int32Array[],
  a: string[],
  b: string[],
  d: number,
  k: number,
  max: number,
): RawEdit[] {
  let x = a.length;
  let y = b.length;
  const raw: RawEdit[] = [];

  for (let step = d; step > 0; step--) {
    const vPrev = trace[step];
    let prevK: number;

    if (
      k === -step ||
      (k !== step && vPrev[max + k - 1] < vPrev[max + k + 1])
    ) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = vPrev[max + prevK];
    const prevY = prevX - prevK;

    let midX: number;
    let midY: number;

    if (prevK === k + 1) {
      // Vertical move: insertion from B
      midX = prevX;
      midY = prevY + 1;
    } else {
      // Horizontal move: deletion from A
      midX = prevX + 1;
      midY = prevY;
    }

    // Snake part: diagonal matches between mid point and (x, y)
    for (let i = x - 1, j = y - 1; i >= midX && j >= midY; i--, j--) {
      raw.unshift({ type: "equal", valA: a[i], valB: b[j] });
    }

    // The edit step itself
    if (prevK === k + 1) {
      raw.unshift({ type: "insert", valA: "", valB: b[prevY] });
    } else {
      raw.unshift({ type: "delete", valA: a[prevX], valB: "" });
    }

    x = prevX;
    y = prevY;
    k = prevK;
  }

  // Initial snake from (0, 0) to starting point of step 1
  for (let i = x - 1, j = y - 1; i >= 0 && j >= 0; i--, j--) {
    raw.unshift({ type: "equal", valA: a[i], valB: b[j] });
  }

  return raw;
}

/**
 * Computes word-level diff between original and revised sentences.
 *
 * @param original The student's original sentence.
 * @param revised The academic revised sentence (Band 6.5 or Band 7.5+).
 * @returns An array of consolidated DiffChunk objects.
 */
export function computeWordDiff(
  original: string,
  revised: string,
): DiffChunk[] {
  // Fast path: exact match
  if (original === revised) {
    return original ? [{ type: "equal", value: original }] : [];
  }
  // Fast path: complete insertion
  if (!original) {
    return revised ? [{ type: "insert", value: revised }] : [];
  }
  // Fast path: complete deletion
  if (!revised) {
    return original ? [{ type: "delete", value: original }] : [];
  }

  const a = tokenize(original);
  const b = tokenize(revised);

  const n = a.length;
  const m = b.length;
  const max = n + m;

  const v = new Int32Array(2 * max + 1);
  const trace: Int32Array[] = [];

  for (let d = 0; d <= max; d++) {
    trace.push(new Int32Array(v));

    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[max + k - 1] < v[max + k + 1])) {
        x = v[max + k + 1];
      } else {
        x = v[max + k - 1] + 1;
      }

      let y = x - k;
      while (x < n && y < m && a[x].trim() === b[y].trim()) {
        x++;
        y++;
      }

      v[max + k] = x;

      if (x >= n && y >= m) {
        const rawEdits = backtrackMyers(trace, a, b, d, k, max);
        return consolidateChunks(rawEdits);
      }
    }
  }

  return [];
}

/**
 * Consolidates raw edit operations into high-level DiffChunk objects,
 * resolving trailing whitespace differences and merging consecutive types.
 */
function consolidateChunks(raw: RawEdit[]): DiffChunk[] {
  const chunks: DiffChunk[] = [];

  for (const item of raw) {
    if (item.type === "equal") {
      if (item.valA === item.valB) {
        chunks.push({ type: "equal", value: item.valA });
      } else {
        const trimA = item.valA.trimEnd();
        const trimB = item.valB.trimEnd();
        const wsA = item.valA.slice(trimA.length);
        const wsB = item.valB.slice(trimB.length);

        if (wsA === wsB) {
          chunks.push({ type: "equal", value: item.valA });
        } else if (wsA.length > wsB.length) {
          // Extra whitespace in original was deleted in revised
          const extraWs = wsA.slice(wsB.length);
          chunks.push({ type: "equal", value: item.valB });
          chunks.push({ type: "delete", value: extraWs });
        } else {
          // Extra whitespace in revised was inserted
          const extraWs = wsB.slice(wsA.length);
          chunks.push({ type: "equal", value: item.valA });
          chunks.push({ type: "insert", value: extraWs });
        }
      }
    } else if (item.type === "delete") {
      chunks.push({ type: "delete", value: item.valA });
    } else {
      chunks.push({ type: "insert", value: item.valB });
    }
  }

  // Group and merge consecutive chunks of identical type
  const merged: DiffChunk[] = [];
  for (const chunk of chunks) {
    if (!chunk.value) continue;
    if (merged.length > 0 && merged[merged.length - 1].type === chunk.type) {
      merged[merged.length - 1].value += chunk.value;
    } else {
      merged.push({ ...chunk });
    }
  }

  return merged;
}
