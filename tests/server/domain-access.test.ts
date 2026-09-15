import express from "express";
import request from "supertest";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock("../../src/server/db/pool", () => ({
  pgPool: { query: mocks.query, connect: async () => mocks },
}));
import router from "../../src/server/domain/router";
import analytics from "../../src/server/domain/analytics";
import { content, DomainError } from "../../src/server/domain/access";
const viewer = {
  id: 4,
  name: "Candidate",
  email: "candidate@test.invalid",
  role: "viewer",
  is_allowed: 0,
};
function app(role = "viewer", allowed = 1) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    req.user = { ...viewer, role, is_allowed: allowed } as any;
    req.isAuthenticated = (() => true) as any;
    next();
  });
  a.use(router);
  a.use("/staff", analytics);
  a.use((e: any, _q: any, r: any, _n: any) =>
    r.status(e.status || 500).json({ error: e.message }),
  );
  return a;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({ rows: [] });
});
it("editors cannot access usage, create domains, or enable restrictions", async () => {
  for (const path of ["/staff/usage", "/staff/domains", "/staff/enforce"]) {
    const response = path.endsWith("usage")
      ? await request(app("manager")).get(path)
      : await request(app("manager")).post(path).send({});
    expect(response.status).toBe(403);
  }
  expect(mocks.query).not.toHaveBeenCalled();
});
it("candidates cannot access the staff workspace APIs", async () =>
  expect((await request(app()).get("/staff/analytics")).status).toBe(403));
it("rejects first requests without a domain and rolls back", async () => {
  const response = await request(app("viewer", 0))
    .post("/access-request")
    .send({ name: "Candidate" });
  expect(response.status).toBe(400);
  expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  expect(mocks.release).toHaveBeenCalled();
});
it("prevents a rejected candidate changing the originally chosen domain", async () => {
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("ORDER BY id DESC")
      ? [{ id: 1, status: "rejected", domain_id: 2 }]
      : [],
  }));
  expect(
    (
      await request(app("viewer", 0))
        .post("/access-request")
        .send({ name: "Candidate", domainId: 3 })
    ).status,
  ).toBe(403);
});
it("duplicate submissions do not create a second pending request", async () => {
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("ORDER BY id DESC")
      ? [{ id: 1, status: "pending", domain_id: 2 }]
      : [],
  }));
  expect(
    (
      await request(app("viewer", 0))
        .post("/access-request")
        .send({ name: "Candidate", domainId: 2 })
    ).status,
  ).toBe(409);
  expect(
    mocks.query.mock.calls.some((c) =>
      c[0].startsWith("INSERT INTO access_requests"),
    ),
  ).toBe(false);
});
it("editor approval grants only candidate access and audits the assigned domain", async () => {
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("status='pending' FOR UPDATE")
      ? [{ id: 1, email: viewer.email, domain_id: 2 }]
      : sql.includes("SELECT * FROM users")
        ? [viewer]
        : sql.includes("SELECT id FROM learning_domains")
          ? [{ id: 2 }]
          : [],
  }));
  expect(
    (
      await request(app("manager"))
        .post("/staff/requests/1/approve")
        .send({ role: "admin" })
    ).status,
  ).toBe(200);
  const update = mocks.query.mock.calls.find((c) =>
    c[0].startsWith("UPDATE users"),
  );
  expect(update?.[0]).not.toContain("SET role");
  expect(update?.[1]).toEqual([4, 2]);
  expect(
    mocks.query.mock.calls.some((c) =>
      c[0].startsWith("INSERT INTO audit_log"),
    ),
  ).toBe(true);
});
it("content queries restrict candidates but leave editors cross-domain", async () => {
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("CROSS JOIN domain_settings")
      ? [{ domain_id: 2, enforced: true }]
      : [],
  }));
  await content(viewer as any, "terms");
  expect(mocks.query.mock.calls.at(-1)?.[1]).toEqual([true, 2]);
  await content({ ...viewer, role: "manager" } as any, "terms");
  expect(mocks.query.mock.calls.at(-1)?.[1]).toEqual([false, 2]);
});
it("does not enable domain access until the readiness checklist is complete", async () => {
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("AS candidates")
      ? [{ candidates: 1, requests: 0, terms: 0, passages: 0, enforced: false }]
      : [],
  }));
  expect(
    (await request(app("admin")).post("/staff/enforce").send({})).status,
  ).toBe(409);
});

it("filters usage by the selected UTC month and rejects malformed months", async () => {
  const response = await request(app("admin")).get("/staff/usage?month=2026-02");
  expect(response.status).toBe(200);
  expect(response.body.month).toBe("2026-02");
  expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("j.month=$1::date"), ["2026-02-01"]);
  mocks.query.mockClear();
  for (const month of ["2026-13", "2026-00", "invalid", "0000-01"]) {
    expect((await request(app("admin")).get(`/staff/usage?month=${month}`)).status).toBe(400);
  }
  expect(mocks.query).not.toHaveBeenCalled();
});
