import { expect, it, vi } from 'vitest';
const content = vi.hoisted(() => vi.fn());
vi.mock('../../src/server/domain/access', async importOriginal => ({...await importOriginal<any>(), content}));
import { practiceGuard } from '../../src/server/domain/practice';
it('permits exact accessible sentences and rejects unrelated speech text', async () => {
  content.mockImplementation(async (_user,kind)=>kind==='terms'?[]:[{question:'Read this?',ideal_answer:'Queues absorb bursts. Workers process messages.'}]);
  const run = async (text:string) => {
    const next=vi.fn();
    await practiceGuard({user:{id:1,role:'viewer',is_allowed:1},path:'/ai/tts',method:'POST',body:{text}} as any,{locals:{domain:{enforced:true}}} as any,next);
    return next;
  };
  expect(await run('Workers process messages.')).toHaveBeenCalledWith();
  expect(await run('Different domain content.')).toHaveBeenCalledWith(expect.objectContaining({status:404}));
});
