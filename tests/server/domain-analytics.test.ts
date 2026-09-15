import { expect, it, vi } from "vitest";
vi.mock("../../src/server/db/pool", () => ({ pgPool: { query: vi.fn() } }));
import {
  dayIST,
  period,
  readingTrend,
} from "../../src/server/domain/analytics";
it("uses India calendar boundaries for 7 and 30 day windows", () => {
  expect(dayIST("2026-09-12T19:00:00Z")).toBe("2026-09-13");
  expect(period(7, new Date("2026-09-12T19:00:00Z"))).toEqual({
    start: "2026-09-06T18:30:00.000Z",
    end: "2026-09-13T18:30:00.000Z",
  });
  expect(
    new Date(period(30).end).getTime() - new Date(period(30).start).getTime(),
  ).toBe(30 * 86400000);
});
const attempt = (
  id: number,
  provider = "azure",
  version = "v1",
  locale = "en-IN",
  content_id = 1,
) => ({
  id,
  user_id: 1,
  content_hash: "same-reference",
  content_id,
  question_ref: "Read",
  created_at: `2026-09-${String(id).padStart(2, "0")}T00:00:00Z`,
  overall_score: 50 + id,
  feedback: { assessment: { provider, version, locale } },
});
it("does not compare across providers, versions, languages, passages or candidates", () => {
  expect(
    readingTrend([
      attempt(1),
      attempt(2, "local"),
      attempt(3, "azure", "v2"),
      attempt(4, "azure", "v1", "en-US"),
      attempt(5, "azure", "v1", "en-IN", 2),
      { ...attempt(6), user_id: 2 },
    ]),
  ).toEqual([]);
});
it("orders comparable readings and ignores unavailable scores", () => {
  const result = readingTrend([
    attempt(3),
    attempt(1),
    { ...attempt(2), overall_score: null },
  ]);
  expect(result).toMatchObject([{ first: 51, latest: 53, count: 2 }]);
});
it("excludes legacy reports with no trustworthy assessment version", () =>
  expect(readingTrend([{ ...attempt(1), feedback: {} }, attempt(2)])).toEqual(
    [],
  ));

it("does not compare edited reference passages", () =>
  expect(
    readingTrend([attempt(1), { ...attempt(2), content_hash: "changed" }]),
  ).toEqual([]));
