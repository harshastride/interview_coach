import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
vi.mock('../../src/server/db/pool.ts', () => ({ pgPool: { query: vi.fn() } }));
import { pgPool } from '../../src/server/db/pool';
import router from '../../src/server/routes/misc';
const query = vi.mocked(pgPool.query);
function app(authenticated = true, allowed = 1) {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    req.isAuthenticated = (() => authenticated) as typeof req.isAuthenticated;
    req.user = { id: 42, is_allowed: allowed } as Express.User;
    next();
  });
  instance.use('/api', router);
  return instance;
}
beforeEach(() => vi.clearAllMocks());
describe('reading history', () => {
  it('rejects anonymous and disallowed requests without querying history', async () => {
    expect((await request(app(false)).get('/api/reading-attempts')).status).toBe(401);
    expect((await request(app(true, 0)).get('/api/reading-attempts')).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
  it('scopes results to the session user, ignoring a supplied user ID', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 7, question_ref: 'Example' }] } as never);
    const response = await request(app()).get('/api/reading-attempts?user_id=99');
    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE user_id = $1'), [42]);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.attempts).toEqual([{ id: 7, question_ref: 'Example' }]);
  });
  it('returns a recoverable error without database details', async () => {
    query.mockRejectedValueOnce(new Error('private connection details'));
    const response = await request(app()).get('/api/reading-attempts');
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Reading history could not be loaded');
  });
});

describe('individual reading reports', () => {
  it('requires access for individual reports', async () => {
    expect((await request(app(false)).get('/api/reading-attempts/7')).status).toBe(401);
    expect((await request(app(true, 0)).get('/api/reading-attempts/7')).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
  it.each(['abc', '0', '-1', '1.5', '2147483648'])('rejects invalid ID %s', async id => {
    expect((await request(app()).get(`/api/reading-attempts/${id}`)).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
  it('loads a report only by both owner and attempt ID', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 7 }] } as never);
    const response = await request(app()).get('/api/reading-attempts/7?user_id=99');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE user_id = $1 AND id = $2'), [42, 7]);
    expect(response.body).toEqual({ attempt: { id: 7 } });
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('does not reveal whether an unavailable report belongs to someone else', async () => {
    query.mockResolvedValueOnce({ rows: [] } as never);
    expect((await request(app()).get('/api/reading-attempts/7')).status).toBe(404);
  });
});

it('requires a receipt bound to the authenticated user and current content scope',async()=>{
 expect((await request(app()).post('/api/reading-attempt').send({question_ref:'Read',scores:{overall:100}})).status).toBe(400);
 query.mockResolvedValueOnce({rows:[]} as never);
 const receiptId='11111111-1111-4111-8111-111111111111';
 expect((await request(app()).post('/api/reading-attempt').send({question_ref:'Read',receiptId})).status).toBe(409);
 expect(query).toHaveBeenCalledWith(expect.stringContaining('user_id=$2'),[receiptId,42,null,null,null]);
});
it('saves server-verified scores and transcript instead of submitted replacements',async()=>{
 query.mockResolvedValueOnce({rows:[{result:{scores:{overall:70,accuracy:71,fluency:72,completeness:73},delivery:{wpm:110,filler_count:0},transcript:'Verified speech'}}]} as never).mockResolvedValueOnce({rows:[]} as never);
 const r=await request(app()).post('/api/reading-attempt').send({question_ref:'Read',receiptId:'11111111-1111-4111-8111-111111111111',scores:{overall:100},transcript:'fake'});
 expect(r.status).toBe(200);
 const values=query.mock.calls[1][1] as any[];
 expect(values[4]).toBe(70);expect(values[10]).toBe('Verified speech');
});
