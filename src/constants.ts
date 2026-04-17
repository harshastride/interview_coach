export interface Flashcard {
  id: string;
  term: string;
  definition: string;
  example: string;
  quizTip: string;
  level: number;
  category: string;
}

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

/** One entry in the question-answer bank (per role/company/category). Stored in DB in production. */
export interface InterviewEntry {
  question: string;
  ideal_answer: string;
  role: string;
  company: string;
  category: string;
}

/** Categories grouped by level. */
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
