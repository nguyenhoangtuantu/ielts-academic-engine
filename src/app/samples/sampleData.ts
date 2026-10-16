import { SentenceItem } from '../../components/diff/SideBySideView';
import { generateSlug } from '../../core/security/piiFilter';

export interface SampleEssay {
  id: string;
  slug: string;
  title: string;
  topic: string;
  essayType: string;
  originalBand: string;
  targetBand: string;
  datePublished: string;
  rawEssay: string;
  sentences: SentenceItem[];
  bandBreakdown: {
    taskAchievement: number;
    coherenceCohesion: number;
    lexicalResource: number;
    grammaticalRange: number;
    overall: number;
  };
  keyTakeaways: string[];
}

export const SAMPLE_ESSAYS: SampleEssay[] = [
  {
    id: 'sample-1',
    slug: 'environmental-degradation-and-individual-responsibility',
    title: 'Environmental Degradation and Individual Responsibility',
    topic: 'Some people believe that environmental problems are too big for individual people to address. To what extent do you agree or disagree?',
    essayType: 'Opinion Essay (Agree / Disagree)',
    originalBand: 'Band 6.0',
    targetBand: 'Band 7.5+',
    datePublished: '2026-03-01T08:00:00.000Z',
    rawEssay:
      'In modern society, many people think that environment pollution is getting worse every day. Governments must have important roles to solve the problem about plastic waste. If citizens don\'t change their habit, our children will suffer many terrible consequences.',
    sentences: [
      {
        sentence_id: 1,
        original: 'In modern society, many people think that environment pollution is getting worse every day.',
        band_65: 'In modern society, many people believe that environmental pollution is becoming increasingly severe.',
        band_75: 'In contemporary society, it is widely argued that environmental degradation has intensified at an unprecedented rate.',
        error_tags: ['word-formation', 'collocation', 'academic-tone'],
        explanation: "'environment pollution' should use the adjective form 'environmental pollution'. In Band 7.5+, 'environmental degradation' and 'intensified at an unprecedented rate' demonstrate sophisticated academic vocabulary.",
      },
      {
        sentence_id: 2,
        original: 'Governments must have important roles to solve the problem about plastic waste.',
        band_65: 'Governments must play a vital role in tackling the issue of plastic waste.',
        band_75: 'Governments bear a paramount responsibility to implement stringent regulatory frameworks combating plastic waste.',
        error_tags: ['collocation', 'preposition'],
        explanation: "We say 'play a role in doing something', not 'have roles to solve about'. 'Bear a paramount responsibility' elevates the register significantly.",
      },
      {
        sentence_id: 3,
        original: "If citizens don't change their habit, our children will suffer many terrible consequences.",
        band_65: 'If citizens do not alter their habits, future generations will face severe consequences.',
        band_75: 'Unless the general public adopts sustainable lifestyle practices, future generations will inevitably face severe ecological fallout.',
        error_tags: ['informal-contraction', 'noun-number', 'collocation'],
        explanation: "Avoid contractions like 'don't' in academic IELTS writing. 'Habit' should be plural 'habits'. 'Ecological fallout' provides domain-specific precision.",
      },
    ],
    bandBreakdown: {
      taskAchievement: 8.0,
      coherenceCohesion: 7.5,
      lexicalResource: 8.0,
      grammaticalRange: 7.5,
      overall: 7.5,
    },
    keyTakeaways: [
      'Eliminate informal contractions (e.g. "don\'t" → "do not" / "Unless")',
      'Upgrade general nouns with precise academic collocations ("environmental degradation" instead of "environment pollution")',
      'Employ conditional inversion and formal concessive structures',
    ],
  },
  {
    id: 'sample-2',
    slug: 'artificial-intelligence-in-modern-education',
    title: 'Artificial Intelligence in Modern Education',
    topic: 'Nowadays, artificial intelligence is increasingly integrated into educational classrooms. Do the advantages of this trend outweigh the disadvantages?',
    essayType: 'Advantages & Disadvantages',
    originalBand: 'Band 6.0',
    targetBand: 'Band 8.0',
    datePublished: '2026-03-05T08:00:00.000Z',
    rawEssay:
      'AI tools make students lazy because they just copy answers from internet. However, smart software can help teachers check homework faster and explain difficult lessons. In conclusion, AI is having more benefits than drawbacks if schools use it in right way.',
    sentences: [
      {
        sentence_id: 1,
        original: 'AI tools make students lazy because they just copy answers from internet.',
        band_65: 'AI applications may encourage student complacency as learners frequently copy solutions from online sources.',
        band_75: 'Over-reliance on automated artificial intelligence platforms risks fostering cognitive indolence when pupils passively extract solutions from cyberspace.',
        error_tags: ['informal-tone', 'missing-article', 'collocation'],
        explanation: "'make students lazy' is overly colloquial; 'fostering cognitive indolence' provides advanced academic precision. Also 'from internet' requires the definite article 'the internet'.",
      },
      {
        sentence_id: 2,
        original: 'However, smart software can help teachers check homework faster and explain difficult lessons.',
        band_65: 'Nevertheless, intelligent software assists educators in grading assignments more efficiently and clarifying complex concepts.',
        band_75: 'Conversely, adaptive pedagogical software empowers educators to streamline diagnostic assessments and elucidate intricate academic concepts.',
        error_tags: ['cohesive-device', 'lexical-resource'],
        explanation: "Replace 'smart software' and 'check homework faster' with academic terminology like 'streamline diagnostic assessments' and 'elucidate intricate concepts'.",
      },
      {
        sentence_id: 3,
        original: 'In conclusion, AI is having more benefits than drawbacks if schools use it in right way.',
        band_65: 'In conclusion, the advantages of artificial intelligence outweigh its downsides provided that institutions deploy it appropriately.',
        band_75: 'To conclude, the pedagogical merits of artificial intelligence decidedly eclipse its drawbacks, presupposing that academic institutions deploy these technologies judiciously.',
        error_tags: ['stative-verb', 'missing-article', 'collocation'],
        explanation: "'is having' is improper for stative possession. 'Outweigh its downsides' or 'decidedly eclipse its drawbacks' correctly answers the prompt.",
      },
    ],
    bandBreakdown: {
      taskAchievement: 8.5,
      coherenceCohesion: 8.0,
      lexicalResource: 8.0,
      grammaticalRange: 8.0,
      overall: 8.0,
    },
    keyTakeaways: [
      'Avoid stative verb continuous tenses (e.g. "is having")',
      'Use sophisticated stance markers ("decidedly eclipse", "empowers educators")',
      'Maintain strong cohesive progression between contrasting viewpoints',
    ],
  },
  {
    id: 'sample-3',
    slug: 'remote-work-and-urban-development',
    title: 'Remote Work and Urban Development',
    topic: 'An increasing number of professionals are choosing to work remotely rather than commute to metropolitan offices. Discuss the positive and negative impacts of this development on urban infrastructure.',
    essayType: 'Discussion Essay',
    originalBand: 'Band 6.5',
    targetBand: 'Band 8.0',
    datePublished: '2026-03-10T08:00:00.000Z',
    rawEssay:
      'Working from home reduces traffic jams in big cities significantly. But small business like restaurants near offices will lose many customers and go bankrupt. Therefore city planners need to rebuild center areas into residential living spaces.',
    sentences: [
      {
        sentence_id: 1,
        original: 'Working from home reduces traffic jams in big cities significantly.',
        band_65: 'Telecommuting substantially decreases traffic congestion in major urban centers.',
        band_75: 'The widespread adoption of telecommuting has substantially mitigated vehicular gridlock across metropolitan corridors.',
        error_tags: ['collocation', 'lexical-resource'],
        explanation: "'Traffic jams' is informal; 'vehicular gridlock' and 'metropolitan corridors' demonstrate high-level lexical resource.",
      },
      {
        sentence_id: 2,
        original: 'But small business like restaurants near offices will lose many customers and go bankrupt.',
        band_65: 'However, local enterprises such as office-district eateries may face severe revenue declines and possible insolvency.',
        band_75: 'Nonetheless, ancillary commercial enterprises situated within central business districts face severe revenue shortfalls and potential insolvency.',
        error_tags: ['informal-conjunction', 'noun-plural', 'collocation'],
        explanation: "Starting sentences with 'But' is discouraged in formal essays. 'Ancillary commercial enterprises' and 'potential insolvency' demonstrate Band 8+ vocabulary.",
      },
      {
        sentence_id: 3,
        original: 'Therefore city planners need to rebuild center areas into residential living spaces.',
        band_65: 'Consequently, urban planners should redevelop central commercial zones into multipurpose residential districts.',
        band_75: 'Consequently, urban authorities must proactively repurpose commercial city centers into integrated, mixed-use residential habitats.',
        error_tags: ['word-choice', 'academic-collocation'],
        explanation: "Upgrades 'rebuild center areas' to 'repurpose commercial city centers into integrated, mixed-use residential habitats'.",
      },
    ],
    bandBreakdown: {
      taskAchievement: 8.0,
      coherenceCohesion: 8.0,
      lexicalResource: 8.5,
      grammaticalRange: 7.5,
      overall: 8.0,
    },
    keyTakeaways: [
      'Replace informal connectors ("But", "And") with formal transitions ("Nonetheless", "Conversely")',
      'Specify economic concepts accurately ("insolvency", "ancillary commercial enterprises")',
      'Use domain-specific urban planning vocabulary',
    ],
  },
  {
    id: 'sample-4',
    slug: 'government-funding-for-space-exploration',
    title: 'Government Funding for Space Exploration',
    topic: 'Some people argue that spending large amounts of money on space research is unjustified while so many domestic problems remain unsolved on Earth. To what extent do you agree?',
    essayType: 'Opinion Essay',
    originalBand: 'Band 6.0',
    targetBand: 'Band 7.5',
    datePublished: '2026-03-12T08:00:00.000Z',
    rawEssay:
      'Space research costs billions dollars that can be spent on poor hospitals and schools. Exploring other planets is good for science, but helping starving people is much more important right now.',
    sentences: [
      {
        sentence_id: 1,
        original: 'Space research costs billions dollars that can be spent on poor hospitals and schools.',
        band_65: 'Space exploration requires billions of dollars that could otherwise be allocated to underfunded medical and educational facilities.',
        band_75: 'Space exploration entails astronomical expenditures that could otherwise be channeled into rehabilitating substandard healthcare and educational infrastructure.',
        error_tags: ['missing-preposition', 'lexical-resource'],
        explanation: "'billions dollars' is missing 'of'. 'Underfunded infrastructure' and 'astronomical expenditures' elevate academic register.",
      },
      {
        sentence_id: 2,
        original: 'Exploring other planets is good for science, but helping starving people is much more important right now.',
        band_65: 'While planetary discovery yields scientific advancements, eradicating acute poverty remains far more urgent.',
        band_75: 'Although celestial discovery yields undeniable scientific dividends, mitigating acute humanitarian crises represents an incomparably urgent moral imperative.',
        error_tags: ['sentence-structure', 'collocation', 'informal-tone'],
        explanation: "Restructures the simplistic coordinate clause into a complex concessive sentence ('Although...'). Upgrades 'starving people' to 'mitigating acute humanitarian crises'.",
      },
    ],
    bandBreakdown: {
      taskAchievement: 7.5,
      coherenceCohesion: 7.5,
      lexicalResource: 8.0,
      grammaticalRange: 7.5,
      overall: 7.5,
    },
    keyTakeaways: [
      'Employ concessive subordination ("Although...", "While...") to balance arguments',
      'Replace "poor" with precise descriptors like "underfunded", "substandard"',
      'Frame moral arguments with academic weight ("moral imperative", "humanitarian crises")',
    ],
  },
];

/**
 * Retrieves a sample essay by its kebab-case slug.
 * Also checks slug generated from title for resilience.
 */
export function getSampleBySlug(slug: string): SampleEssay | null {
  const normalizedSlug = slug.toLowerCase().trim();
  const found = SAMPLE_ESSAYS.find(
    (item) => item.slug === normalizedSlug || generateSlug(item.title) === normalizedSlug
  );
  return found || null;
}

/**
 * Returns all sample essay slugs for static path generation or sitemaps.
 */
export function getAllSampleSlugs(): string[] {
  return SAMPLE_ESSAYS.map((sample) => sample.slug);
}

/**
 * Returns all sample essays.
 */
export function getAllSampleEssays(): SampleEssay[] {
  return SAMPLE_ESSAYS;
}
