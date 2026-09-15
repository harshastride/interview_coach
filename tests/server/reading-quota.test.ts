import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock('../../src/server/db/pool', () => ({ pgPool: { connect: async () => mocks } }));
import { reserveReading } from '../../src/server/services/readingQuota';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT id, status')) return { rows: [] };
    if (sql.includes('SUM(azure_seconds)')) return { rows: [{ used: 1740, count: 5 }] };
    if (sql.includes('INSERT INTO')) return { rows: [{ id: 123 }] };
    return { rows: [] };
  });
});
it('locks the user and commits rounded seconds before returning a checkpoint', async () => {
  expect(await reserveReading(42, 'fingerprint', 59.5, 'passage')).toMatchObject({ azure: true, id: 123 });
  const calls = mocks.query.mock.calls;
  expect(calls[2]).toEqual(['SELECT pg_advisory_xact_lock(7819, $1)', [42]]);
  expect(calls.find(c => c[0].includes('INSERT INTO'))[1]).toEqual([42, 'fingerprint', 'passage', 60]);
  expect(calls.at(-1)).toEqual(['COMMIT']);
  expect(mocks.release).toHaveBeenCalledOnce();
});
it('reserves zero Azure seconds if a recording cannot fit', async () => {
  expect(await reserveReading(42, 'new', 60.1, 'passage')).toMatchObject({ azure: false });
  expect(mocks.query.mock.calls.find(c => c[0].includes('INSERT INTO'))[1][3]).toBe(0);
});
it('reuses a completed recording without another reservation', async () => {
  mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('SELECT id, status') ? [{ id: 1, status: 'complete', result: { transcript: 'saved' } }] : [] }));
  expect(await reserveReading(42, 'same', 60, 'passage')).toMatchObject({ cached: { transcript: 'saved' }, azure: false });
  expect(mocks.query.mock.calls.some(c => c[0].includes('INSERT INTO'))).toBe(false);
});
it('rolls back interrupted duplicates and releases the connection', async () => {
  mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes('SELECT id, status') ? [{ id: 1, status: 'pending' }] : [] }));
  await expect(reserveReading(42, 'same', 60, 'passage')).rejects.toThrow('already processing');
  expect(mocks.query.mock.calls.at(-1)).toEqual(['ROLLBACK']);
  expect(mocks.release).toHaveBeenCalledOnce();
});
