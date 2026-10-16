/**
 * Core Sentence Splitter for Academic IELTS Writing Feedback Engine.
 *
 * Implements rule-based sentence boundary disambiguation (SBD) to reliably
 * split essays into discrete sentences while protecting:
 * - Abbreviations (e.g., i.e., etc., vs., cf., fig., no., approx.)
 * - Titles / Honorifics (Mr., Mrs., Ms., Dr., Prof., Sr., Jr., St., etc.)
 * - Multi-dot Acronyms (U.S.A., U.K., Ph.D., etc.)
 * - Decimal numbers and currency ($3.50, 4.5%)
 * - Initials (John F. Kennedy)
 * - Ellipsis (... or …)
 */

const SENTINEL = '\uE000';

/**
 * Masks periods in abbreviations, decimals, and honorifics with a temporary sentinel
 * so they are not mistaken for sentence terminators.
 */
function maskAbbreviations(text: string): string {
  let masked = text;

  // 1. Mask ellipsis (... or …)
  masked = masked.replace(/\.{3,}/g, (m) => SENTINEL.repeat(m.length));

  // 2. Decimal numbers and percentages: e.g. 3.14, 10.5%, $5.50
  masked = masked.replace(/(\d+)\.(\d+)/g, `$1${SENTINEL}$2`);

  // 3. Titles and Honorifics followed by period (e.g. Mr., Dr., Prof.)
  masked = masked.replace(
    /\b(Mr|Mrs|Ms|Miss|Dr|Prof|Sr|Jr|St|Rev|Gen|Sen|Rep|Gov|Capt|Col|Lt)\./gi,
    `$1${SENTINEL}`
  );

  // 4. e.g. and i.e. are always non-sentence-terminating abbreviations
  masked = masked.replace(/\b([eE]\.[gG]\.|[iI]\.[eE]\.)/g, (m) =>
    m.replace(/\./g, SENTINEL)
  );

  // 5. Acronyms with periods (e.g. U.S.A., U.K., Ph.D.):
  // Internal periods are never sentence terminators (e.g. U. and S. in U.S.A.)
  masked = masked.replace(/\b([A-Za-z])\.(?=[A-Za-z]\.)/g, `$1${SENTINEL}`);
  // Trailing period of acronym is masked when followed by lowercase, punctuation, or titles
  masked = masked.replace(
    /([A-Za-z])\.(?=\s*(?:[a-z0-9,;:–—]|Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.))/g,
    `$1${SENTINEL}`
  );

  // 6. Common academic abbreviations: etc., vs., cf., fig., no., approx., dept., est.
  masked = masked.replace(
    /\b(etc|vs|cf|fig|no|approx|est|dept|al)\.(?=\s*[a-z0-9,;:–—])/gi,
    `$1${SENTINEL}`
  );

  // 7. Single letter initials followed by capitalized surname: e.g. 'John F. Kennedy', 'A. Smith'
  masked = masked.replace(/\b([A-Z])\.\s+(?=[A-Z][a-z])/g, `$1${SENTINEL} `);

  return masked;
}

/**
 * Splits an essay or paragraph text into individual sentences.
 *
 * @param text The input text to split.
 * @returns An array of trimmed sentences.
 */
export function splitSentences(text: string): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  // Split by paragraph breaks first (sentences never cross paragraph boundaries)
  const paragraphs = trimmed.split(/(?:\r?\n){2,}/);
  const sentences: string[] = [];
  const sentinelRegex = new RegExp(SENTINEL, 'g');

  for (const para of paragraphs) {
    const cleanPara = para.trim();
    if (!cleanPara) continue;

    const masked = maskAbbreviations(cleanPara);
    // Matches content up to [.?!] optionally followed by closing quotes/parentheses, or until end of paragraph
    const regex = /([^.?!]+(?:[.?!]+['"’”\)\]]*|$))/g;
    const matches = masked.match(regex);

    if (matches) {
      for (const match of matches) {
        const restored = match.replace(sentinelRegex, '.').trim();
        if (restored) {
          sentences.push(restored);
        }
      }
    }
  }

  return sentences;
}
