import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('AI evaluate-answer route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('uses Gemini 2.5 for evaluating the spoken answer against the ideal answer', async () => {
    const generateTextMock = vi.fn().mockResolvedValue(JSON.stringify({
      overall_score: 8,
      accuracy: 80,
      pronunciation: 82,
      clarity: 85,
      fluency: 84,
      confidence: 81,
      speaking_pace: 79,
      performance: 'Good',
      feedback: 'Strong reading',
      suggestion: 'Speak slightly slower',
      missed_words: ['important']
    }));

    vi.doMock('../../src/server/routes/ai.js', async () => {
      const actual = await vi.importActual<typeof import('../../src/server/routes/ai.js')>('../../src/server/routes/ai.js');
      return {
        ...actual,
        generateText: generateTextMock,
      };
    });

    const { default: router } = await import('../../src/server/routes/ai.js');
    const app = { use: vi.fn() };
    const routerStack = [] as Array<{ route: string; method: string; handler: Function }>;

    const use = (path: string, ...handlers: Array<Function>) => {
      routerStack.push({ route: path, method: 'post', handler: handlers[handlers.length - 1] });
    };

    (router as any).stack = [{ route: '/evaluate-answer', methods: { post: true }, handle: vi.fn() }];
    (router as any).handle = vi.fn();
    (router as any).use = use;

    const routeHandler = (router as any).stack[0].handle;
    const req = {
      body: {
        question: 'What is Azure SQL?',
        userAnswer: 'Azure SQL is a managed database service',
        idealAnswer: 'Azure SQL is a managed relational database service',
        role: 'candidate',
        category: 'database'
      },
      user: { id: 1, role: 'viewer' }
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    await routeHandler(req, res, vi.fn());

    expect(generateTextMock).toHaveBeenCalledWith(expect.stringContaining('Compare the spoken transcript against the ideal answer text'), 'gemini-2.5-flash');
  });
});
