import { TERM_ENTRIES } from './termData';

export interface Flashcard {
  id: string;
  term: string;
  definition: string;
  example: string;
  quizTip: string;
  level: number;
  category: string;
}

function slug(term: string): string {
  return term
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[()/]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'term';
}

function uniqueId(term: string, seen: Set<string>): string {
  let id = slug(term);
  let counter = 0;
  while (seen.has(id)) {
    counter++;
    id = `${slug(term)}-${counter}`;
  }
  seen.add(id);
  return id;
}

function buildFlashcards(): Flashcard[] {
  const seen = new Set<string>();
  return TERM_ENTRIES.map(({ t, d, l, c }) => ({
    id: uniqueId(t, seen),
    term: t,
    definition: d,
    example: `e.g. ${d.slice(0, 60)}${d.length > 60 ? '…' : ''}`,
    quizTip: `Focus on: ${c}.`,
    level: l,
    category: c,
  }));
}

export const AZURE_DATA_TERMS: Flashcard[] = buildFlashcards();

/** All unique categories in logical order (by topic, not level). Used for topic-first selection. */
export const ALL_CATEGORIES: string[] = [
  'Cloud & Internet Basics',
  'Azure Basics',
  'Data Basics',
  'SQL Fundamentals',
  'Python Basics',
  'File Formats',
  'Python Intermediate',
  'Python Key Libraries',
  'Azure Data Services',
  'ETL & Data Integration',
  'Apache Spark Core',
  'Spark Streaming',
  'Delta Lake',
  'Azure Databricks',
  'Data Architecture Concepts',
  'SQL Advanced',
  'Streaming & Messaging',
  'dbt & Orchestration',
  'Data Quality & Governance',
  'Security & Access',
  'DevOps & Version Control',
  'Monitoring & Observability',
  'Networking & Protocols',
  'Power BI & Reporting',
];

/** Level labels for optional filter. */
export const LEVEL_LABELS: Record<number, string> = {
  2: 'Beginner',
  3: 'Elementary',
  4: 'Intermediate',
  5: 'Advanced',
};

/** One entry in the question-answer bank (per role/company). Stored in DB in production. */
export interface InterviewEntry {
  question: string;
  ideal_answer: string;
  role: string;
  company: string;
}

/** Interview questions are managed via admin uploads (DB/API). */
export const INTERVIEW_BANK: InterviewEntry[] = [];

/** Unique roles and companies from the bank (for selection). In production, load from DB. */
export const INTERVIEW_ROLES = [...new Set(INTERVIEW_BANK.map((e) => e.role))];
export const INTERVIEW_COMPANIES = [...new Set(INTERVIEW_BANK.map((e) => e.company))];

/** Backward compatibility: flat lists. */
export const INTERVIEW_QUESTIONS = INTERVIEW_BANK.map((e) => e.question);
export const INTERVIEW_ANSWERS = INTERVIEW_BANK.map((e) => e.ideal_answer);

/** Kept for backward compatibility; categories grouped by level. */
export const CATEGORIES_BY_LEVEL: Record<number, string[]> = {
  2: ['Cloud & Internet Basics', 'Azure Basics', 'Data Basics'],
  3: ['SQL Fundamentals', 'Python Basics', 'File Formats'],
  4: ['Python Intermediate', 'Python Key Libraries', 'Azure Data Services', 'ETL & Data Integration'],
  5: [
    'Apache Spark Core', 'Spark Streaming', 'Delta Lake', 'Azure Databricks',
    'Data Architecture Concepts', 'SQL Advanced', 'Streaming & Messaging',
    'dbt & Orchestration', 'Data Quality & Governance', 'Security & Access',
    'DevOps & Version Control', 'Monitoring & Observability', 'Networking & Protocols',
    'Power BI & Reporting',
  ],
};
