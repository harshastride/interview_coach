import express from 'express';
import { requireAuth } from '../middleware/auth.ts';
import { content,wrap } from '../domain/access.ts';
const router=express.Router();
export function invalidateContentCache() {} // Responses are now scoped and uncached.
for(const kind of ['terms','interview'] as const) router.get('/'+kind,requireAuth,wrap(async(req,res)=>{res.set('Cache-Control','no-store');res.json(await content(req.user!,kind));}));
export default router;
