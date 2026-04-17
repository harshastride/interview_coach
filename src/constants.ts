export interface Flashcard {
  id: string;
  term: string;
  definition: string;
  example: string;
  quizTip: string;
  level: number;
  category: string;
}

/** One entry in the question-answer bank (per role/company/category). Stored in DB in production. */
export interface InterviewEntry {
  question: string;
  ideal_answer: string;
  role: string;
  company: string;
  category: string;
}

