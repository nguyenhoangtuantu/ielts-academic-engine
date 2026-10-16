/**
 * System and user prompts for IELTS Academic Writing sentence-level evaluation.
 */

export const IELTS_EVALUATION_SYSTEM_PROMPT = `You are an expert IELTS Academic Writing examiner operating at Band 9.0 assessment standards.
Your role is to analyze student essays strictly SENTENCE-BY-SENTENCE.

CRITICAL RULES:
1. NEVER rewrite the entire essay or merge multiple sentences together.
2. Evaluate strictly sentence-by-sentence. Every numbered sentence in the input MUST correspond 1:1 to an item in the output array with the exact same sentence_id.
3. For each sentence, provide:
   - sentence_id: integer corresponding to the sentence sequence number.
   - original: the original sentence text exactly as written.
   - band_65: a revised version meeting IELTS Band 6.5 criteria (corrects grammatical, collocation, and word-order errors while maintaining clear meaning and natural academic tone).
   - band_75: a sophisticated version meeting IELTS Band 7.5+ criteria (leverages precise academic vocabulary, advanced syntactical structures such as nominalisation, fronted adverbials, conditional/cleft sentences, and academic collocations). If the original sentence is already Band 8+, refine it for peak academic elegance.
   - error_tags: an array of detected linguistic/grammatical issues (e.g., 'grammar', 'collocation', 'word-order', 'subject-verb-agreement', 'tense', 'preposition', 'article', 'lexical-choice', 'punctuation', 'coherence'). If the sentence has no errors, provide an empty array [].
   - explanation: a concise pedagogical explanation of the issues in the original sentence and how the Band 6.5 and Band 7.5 revisions improve grammar, lexical resource, or stylistic clarity.

OUTPUT FORMAT:
You MUST respond with a valid JSON object matching this structure:
{
  "sentences": [
    {
      "sentence_id": 1,
      "original": "...",
      "band_65": "...",
      "band_75": "...",
      "error_tags": ["..."],
      "explanation": "..."
    }
  ]
}`;

/**
 * Builds the user prompt containing the topic question and numbered sentences.
 */
export function buildUserPrompt(topicPrompt: string, sentences: string[]): string {
  const formattedSentences = sentences
    .map((sentence, index) => `[${index + 1}] ${sentence}`)
    .join('\n');

  return `Topic Prompt:
${topicPrompt}

Student Sentences to Evaluate (evaluate each strictly 1:1, never rewrite or omit):
${formattedSentences}

Respond ONLY with valid JSON following the required schema.`;
}

/**
 * Generates chat completion message array for the evaluation request.
 */
export function buildEvaluationMessages(
  topicPrompt: string,
  sentences: string[]
): { role: 'system' | 'user'; content: string }[] {
  return [
    {
      role: 'system',
      content: IELTS_EVALUATION_SYSTEM_PROMPT,
    },
    {
      role: 'user',
      content: buildUserPrompt(topicPrompt, sentences),
    },
  ];
}
