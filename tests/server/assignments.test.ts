import express from 'express';
import request from 'supertest';
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),release:vi.fn()}));
vi.mock('../../src/server/db/pool',()=>({pgPool:{query:mocks.query,connect:async()=>mocks}}));
import router from '../../src/server/domain/assignments';
function app(role='viewer'){const a=express();a.use(express.json());a.use((q,_r,n)=>{q.user={id:42,role,is_allowed:1} as any;q.isAuthenticated=(()=>true) as any;n();});a.use(router);a.use((e:any,_q:any,r:any,_n:any)=>r.status(e.status||500).json({error:e.message}));return a;}
beforeEach(()=>{vi.clearAllMocks();mocks.query.mockResolvedValue({rows:[]});});
it('scopes candidate assignments to authenticated identity and disables caching',async()=>{const r=await request(app()).get('/assignments?candidateId=99');expect(r.status).toBe(200);expect(r.headers['cache-control']).toBe('no-store');expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('a.candidate_id=$1'),[42,'','',5,0]);});
it('rejects candidate assignment creation and staff lists',async()=>{expect((await request(app()).post('/staff/candidates/2/assignments').send({contentId:1})).status).toBe(403);expect((await request(app()).get('/staff/candidates/2/assignments')).status).toBe(403);expect(mocks.query).not.toHaveBeenCalled();});
it('rejects invalid IDs, notes and unavailable domain content',async()=>{expect((await request(app('manager')).post('/staff/candidates/no/assignments').send({contentId:1})).status).toBe(400);expect((await request(app('manager')).post('/staff/candidates/2/assignments').send({contentId:1,note:'x'.repeat(1001)})).status).toBe(400);expect((await request(app('manager')).post('/staff/candidates/2/assignments').send({contentId:1})).status).toBe(409);expect(mocks.release).toHaveBeenCalled();});
