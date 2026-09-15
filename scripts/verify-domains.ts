import {createHash} from 'node:crypto';
import "../src/server/env.ts";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { pgPool } from "../src/server/db/pool.ts";
import router from "../src/server/domain/router.ts";
import {issueReadingReceipt} from '../src/server/services/readingReceipt.ts';
import assignments from '../src/server/domain/assignments.ts';
import misc from '../src/server/routes/misc.ts';
import analytics from "../src/server/domain/analytics.ts";
import {
  domainGuard,
  content,
  DomainError,
} from "../src/server/domain/access.ts";
import { practiceGuard } from "../src/server/domain/practice.ts";
// All fixtures live in connection-local temporary tables in a rolled-back transaction.
const c = await pgPool.connect();
try {
  await c.query("BEGIN");
  for (const t of [
    "users",
    "learning_domains",
    "domain_settings",
    "access_requests",
    "email_allowlist",
    "audit_log",
    "uploaded_terms",
    "uploaded_interview",
    "term_domains",
    "interview_domains",
    "session_state",
    "reading_receipts",
    "reading_attempts",
    "reading_assignments",
    "reading_analysis_jobs",
    "domain_activity",
  ])
    await c.query(
      `CREATE TEMP TABLE ${t} (LIKE public.${t} INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES) ON COMMIT DROP`,
    );
  await c.query(
    "INSERT INTO learning_domains(id,slug,name) VALUES(1,'python-test','Python test'),(2,'java-test','Java test')",
  );
  await c.query("INSERT INTO domain_settings(id,enforced) VALUES(1,false)");
  await c.query(
    "INSERT INTO users(id,google_id,email,name,role,is_allowed) VALUES(900001,'domain-test-candidate','candidate@domain-test.invalid','Test candidate','viewer',0),(900002,'domain-test-editor','editor@domain-test.invalid','Test editor','manager',1),(900003,'domain-test-admin','admin@domain-test.invalid','Test admin','admin',1)",
  );
  const q = async (sql: any, args?: any) => {
    if (sql === "BEGIN") return c.query("SAVEPOINT mutation");
    if (sql === "COMMIT") return c.query("RELEASE SAVEPOINT mutation");
    if (sql === "ROLLBACK") return c.query("ROLLBACK TO SAVEPOINT mutation");
    return c.query(sql, args);
  };
  (pgPool as any).query = q;
  (pgPool as any).connect = async () => ({ query: q, release: () => {} });
  const app = express();
  app.use(express.json());
  app.use(async (req, res, next) => {
    req.user = (
      await c.query("SELECT * FROM users WHERE id=$1", [
        Number(req.headers["x-test-user"] ?? 900001),
      ])
    ).rows[0];
    req.isAuthenticated = (() => !!req.user) as any;
    next();
  });
  app.use(domainGuard);
  app.use(router);
  app.use(assignments);
  app.use("/staff", analytics);
  app.use(practiceGuard);
  app.use(misc);
  app.post("/ai/analyze-reading", (req, res) =>
    res.json({
      reference: req.body.referenceText,
      contentId: res.locals.contentId,
    }),
  );
  app.use((e: any, _q: any, r: any, _n: any) =>
    r.status(e.status ?? 500).json({ error: e.message }),
  );
  const user = (id: number) => String(id);
  const candidate = 900001,
    editor = 900002,
    admin = 900003;
  let r = await request(app)
    .post("/access-request")
    .send({ name: "Test candidate", domainId: 1 });
  assert.equal(r.status, 200);
  const requestId = r.body.id;
  assert.equal(
    (
      await request(app)
        .post("/access-request")
        .send({ name: "Duplicate", domainId: 2 })
    ).status,
    409,
  );
  assert.equal((await request(app).get("/access-request")).body.domain_id, 1);
  assert.equal(
    (
      await request(app)
        .post(`/staff/requests/${requestId}/approve`)
        .set("x-test-user", user(editor))
        .send({ role: "admin" })
    ).status,
    200,
  );
  assert.equal(
    (await c.query("SELECT role FROM users WHERE id=$1", [candidate])).rows[0]
      .role,
    "viewer",
  );
  assert.equal(
    (
      await request(app)
        .post(`/staff/requests/${requestId}/approve`)
        .set("x-test-user", user(editor))
        .send({})
    ).status,
    409,
  );
  assert.equal(
    (await request(app).get("/staff/usage").set("x-test-user", user(editor)))
      .status,
    403,
  );
  assert.equal((await request(app).get("/staff/analytics")).status, 403);
  await c.query(
    "INSERT INTO uploaded_interview(id,question,ideal_answer,role,company,category) VALUES(910001,'Shared passage','Approved reference','Engineer','Test','General'),(910002,'Java only','Private Java reference','Engineer','Test','General')",
  );
  await c.query(
    "INSERT INTO interview_domains(content_id,domain_id) VALUES(910001,1),(910001,2),(910002,2)",
  );
  assert.equal(
    (
      await request(app)
        .post("/staff/enforce")
        .set("x-test-user", user(admin))
        .send({})
    ).status,
    200,
  );
  const u = (await c.query("SELECT * FROM users WHERE id=$1", [candidate]))
    .rows[0];
  assert.deepEqual(
    (await content(u, "interview")).map((r) => r.id),
    [910001],
  );
  assert.equal(
    (
      await request(app)
        .post("/ai/analyze-reading")
        .send({ contentId: 910002, referenceText: "spoof" })
    ).status,
    404,
  );
  r = await request(app)
    .post("/ai/analyze-reading")
    .send({ contentId: 910001, referenceText: "spoof" });
  assert.equal(r.body.reference, "Approved reference");
  assert.equal(
    (
      await request(app)
        .post("/ai/analyze-reading")
        .send({ referenceText: "spoof" })
    ).status,
    400,
  );
  await c.query(
    "INSERT INTO session_state(user_id,module,state_json) VALUES($1,'reading','{}')",
    [candidate],
  );
  await c.query(
    "INSERT INTO reading_attempts(user_id,question_ref,domain_id,content_id,overall_score,created_at,feedback,content_hash) VALUES($1,'Shared passage',1,910001,60,NOW()-INTERVAL '1 day',$2,'same'),($1,'Shared passage',1,910001,70,NOW(),$2,'same')",
    [
      candidate,
      JSON.stringify({
        assessment: { provider: "azure", version: "test-v1", locale: "en-IN" },
      }),
    ],
  );
  r = await request(app)
    .get("/staff/analytics?domainId=1")
    .set("x-test-user", user(editor));
  assert.equal(r.status, 200);
  assert.equal(r.body.summary.readings, 2);
  assert.equal(r.body.summary.returning, 1);
  assert.equal(r.body.summary.active, 1);
  r = await request(app)
    .get(`/staff/candidates/${candidate}/reports`)
    .set("x-test-user", user(editor));
  assert.equal(r.body.trends.length, 1);
  assert.equal(
    (
      await request(app)
        .patch(`/staff/candidates/${candidate}/domain`)
        .set("x-test-user", user(editor))
        .send({ domainId: 2 })
    ).status,
    200,
  );
  assert.equal(
    (
      await c.query(
        "SELECT COUNT(*)::int AS n FROM session_state WHERE user_id=$1",
        [candidate],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await c.query("SELECT domain_id FROM reading_attempts WHERE user_id=$1", [
        candidate,
      ])
    ).rows[0].domain_id,
    1,
  );
  assert.equal(
    (
      await request(app)
        .post("/ai/analyze-reading")
        .set("X-Access-Scope", "900001:1:1:true")
        .send({ contentId: 910001 })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(app)
        .get("/staff/reports/2147483647")
        .set("x-test-user", user(editor))
    ).status,
    404,
  );
  r = await request(app).post(`/staff/candidates/${candidate}/assignments`).set('x-test-user',user(editor)).send({contentId:910001,note:'Pause between sentences.'});
  assert.equal(r.status,201,JSON.stringify(r.body));
  assert.equal((await request(app).post(`/staff/candidates/${candidate}/assignments`).set('x-test-user',user(editor)).send({contentId:910001})).status,409);
  assert.equal((await request(app).post(`/staff/candidates/${candidate}/assignments`).send({contentId:910002})).status,403);
  const proof=await issueReadingReceipt(candidate,910001,2,createHash('sha256').update('Approved reference').digest('hex'),Buffer.from('fixture audio').toString('base64'),{scores:{overall:70,accuracy:70,fluency:70,completeness:70},transcript:'Approved reference',delivery:{wpm:100,filler_count:0}});
  const save = {contentId:910001,receiptId:proof.receiptId,submissionId:'assignment-fixture',scores:{overall:100},transcript:'Forged transcript'};
  assert.equal((await request(app).post('/reading-attempt').send({...save,receiptId:undefined})).status,400);
  r = await request(app).post('/reading-attempt').send(save);
  assert.equal(r.status,200,JSON.stringify(r.body));
  const complete=(await request(app).get('/assignments')).body.assignments[0];
  assert.equal(complete.status,'completed');
  assert.ok(complete.completed_attempt_id);
  const stored=(await c.query('SELECT overall_score,transcript FROM reading_attempts WHERE id=$1',[complete.completed_attempt_id])).rows[0];
  assert.equal(stored.overall_score,70);assert.equal(stored.transcript,'Approved reference');
  assert.equal((await request(app).get('/assignments').set('x-test-user',user(editor))).body.assignments.length,0);
  assert.equal((await request(app).post(`/staff/candidates/${candidate}/assignments`).set('x-test-user',user(editor)).send({contentId:910001})).status,201);
  await request(app).post('/reading-attempt').send(save);
  assert.equal((await request(app).get('/assignments')).body.assignments[0].status,'pending');
  await c.query('UPDATE users SET domain_id=1 WHERE id=$1',[candidate]);
  assert.equal((await request(app).get('/assignments')).body.assignments[0].available,false);
  assert.equal((await request(app).post(`/staff/candidates/${candidate}/assignments`).set('x-test-user',user(editor)).send({contentId:910002})).status,409);
  await c.query("INSERT INTO reading_assignments(candidate_id,assigned_by,domain_id,content_id,question,note,status,created_at) SELECT $1,$2,1,910001,'Archived exercise',CASE WHEN n=1 THEN 'rare historical note' ELSE 'other' END,'cancelled',NOW()-n*INTERVAL '1 day' FROM generate_series(1,105) n",[candidate,editor]);
  const history=await request(app).get('/assignments?status=cancelled&search=rare&page=1&pageSize=5');
  assert.equal(history.body.total,1);assert.equal(history.body.assignments.length,1);
  const secondPage=await request(app).get('/assignments?status=cancelled&page=2&pageSize=5');
  assert.equal(secondPage.body.total,105);assert.equal(secondPage.body.assignments.length,5);
  console.log('Verified domain-scoped assignments, editor creation, duplicate protection, saved-reading completion, replay safety, ownership and unavailable assignments after domain change.');
  console.log(
    "Verified request persistence, duplicate decisions, editor approvals, role/usage isolation, shared content, server reference resolution, domain changes, historical attribution, trends and stale-client denial.",
  );
} finally {
  await c.query("ROLLBACK");
  c.release();
  await pgPool.end();
}
