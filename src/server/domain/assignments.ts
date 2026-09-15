import express from 'express';
import { pgPool } from '../db/pool.ts';
import { requireAuth, requireUploader } from '../middleware/auth.ts';
import { DomainError, id, wrap } from './access.ts';
const router=express.Router();
router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});
const available=`u.is_allowed=1 AND u.role='viewer' AND u.domain_id=a.domain_id AND d.active AND NOT p.archived AND EXISTS(SELECT 1 FROM interview_domains m WHERE m.content_id=p.id AND m.domain_id=a.domain_id)`;
async function list(candidateId:number,query:any) {
 const page=Number(query.page??1),pageSize=Number(query.pageSize??5),status=query.status??'',search=query.search??'';
 if(!Number.isInteger(page)||page<1||page>1000000||!Number.isInteger(pageSize)||pageSize<1||pageSize>20||typeof status!=='string'||!['','pending','completed','cancelled'].includes(status)||typeof search!=='string'||search.length>200)throw new DomainError(400,'Invalid assignment filters.');
 const row=(await pgPool.query(`WITH matches AS (SELECT a.*,d.name AS domain_name,staff.name AS assigned_by_name,COALESCE((${available}),false) AS available FROM reading_assignments a JOIN users u ON u.id=a.candidate_id JOIN users staff ON staff.id=a.assigned_by JOIN learning_domains d ON d.id=a.domain_id LEFT JOIN uploaded_interview p ON p.id=a.content_id WHERE a.candidate_id=$1 AND ($2='' OR a.status=$2) AND POSITION(LOWER($3) IN LOWER(a.question||' '||a.note))>0)
 SELECT COUNT(*)::int AS total,COALESCE((SELECT json_agg(r) FROM (SELECT * FROM matches ORDER BY (status='pending') DESC,created_at DESC,id DESC LIMIT $4 OFFSET $5) r),'[]'::json) AS assignments FROM matches`,[candidateId,status,search.trim(),pageSize,(page-1)*pageSize])).rows[0];
 return {...(row??{total:0,assignments:[]}),page,pageSize};
}
router.get('/assignments',requireAuth,wrap(async(req,res)=>{res.json(await list(req.user!.id,req.query));}));
router.get('/staff/candidates/:id/assignments',requireUploader,wrap(async(req,res)=>{
 const candidateId=id(req.params.id);
 const candidate=(await pgPool.query("SELECT u.id,u.domain_id,d.name AS domain_name FROM users u LEFT JOIN learning_domains d ON d.id=u.domain_id WHERE u.id=$1 AND u.role='viewer'",[candidateId])).rows[0];
 if(!candidate)throw new DomainError(404,'Candidate not found.');
 const passages=(await pgPool.query(`SELECT p.id,p.question,p.category FROM uploaded_interview p JOIN interview_domains m ON m.content_id=p.id JOIN learning_domains d ON d.id=m.domain_id AND d.active WHERE m.domain_id=$1 AND NOT p.archived ORDER BY p.question,p.id`,[candidate.domain_id])).rows;
 res.json({...await list(candidateId,req.query),passages,candidate});
}));
async function transaction(fn:(c:any)=>Promise<any>){const c=await pgPool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(98127)');const value=await fn(c);await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
router.post('/staff/candidates/:id/assignments',requireUploader,wrap(async(req,res)=>{
 const candidateId=id(req.params.id),contentId=id(req.body.contentId),note=req.body.note??'';
 if(typeof note!=='string'||note.trim().length>1000)throw new DomainError(400,'Keep the coaching note within 1,000 characters.');
 await transaction(async c=>{
  const target=(await c.query(`SELECT u.domain_id,p.question FROM users u JOIN learning_domains d ON d.id=u.domain_id AND d.active JOIN interview_domains m ON m.domain_id=u.domain_id JOIN uploaded_interview p ON p.id=m.content_id AND NOT p.archived WHERE u.id=$1 AND u.role='viewer' AND u.is_allowed=1 AND p.id=$2 FOR UPDATE OF u,p`,[candidateId,contentId])).rows[0];
  if(!target)throw new DomainError(409,'Choose an active passage in this approved candidate’s assigned domain.');
  const assignment=(await c.query(`INSERT INTO reading_assignments(candidate_id,assigned_by,domain_id,content_id,question,note) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(candidate_id,content_id) WHERE status='pending' DO NOTHING RETURNING id`,[candidateId,req.user!.id,target.domain_id,contentId,target.question,note.trim()])).rows[0];
  if(!assignment)throw new DomainError(409,'This candidate already has a pending assignment for this passage.');
  await c.query('INSERT INTO audit_log(performed_by,action,target,detail) VALUES($1,$2,$3,$4)',[req.user!.id,'reading_assignment_create',String(candidateId),JSON.stringify({assignmentId:assignment.id,contentId})]);
 });res.status(201).json({ok:true});
}));
router.post('/staff/assignments/:id/cancel',requireUploader,wrap(async(req,res)=>{
 await transaction(async c=>{const assignment=(await c.query("UPDATE reading_assignments SET status='cancelled' WHERE id=$1 AND status='pending' RETURNING candidate_id",[id(req.params.id)])).rows[0];if(!assignment)throw new DomainError(409,'This assignment is no longer pending.');await c.query('INSERT INTO audit_log(performed_by,action,target,detail) VALUES($1,$2,$3,$4)',[req.user!.id,'reading_assignment_cancel',String(assignment.candidate_id),JSON.stringify({assignmentId:id(req.params.id)})]);});res.json({ok:true});
}));
export default router;
