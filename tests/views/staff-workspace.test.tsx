import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import StaffWorkspace from "../../src/views/StaffWorkspace";
vi.mock("../../src/components/GlobalNav", () => ({
  AppLayout: ({ children }: any) => <>{children}</>,
}));
vi.mock("../../src/views/shared", () => ({ useBottomNav: () => ({}) }));
vi.mock("../../src/components/AdminPanel", () => ({ default: () => null }));
afterEach(() => vi.unstubAllGlobals());
const user = {
  id: 1,
  name: "Editor",
  email: "editor@test.invalid",
  role: "manager",
  isAllowed: true,
  avatar_url: null,
};
function mount(role = "manager", path = "/staff/overview") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/staff/:section"
          element={<StaffWorkspace user={{ ...user, role }} onContentRefresh={() => {}} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}
it("renders editor empty analytics with no usage or enable controls", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.endsWith("domains")
          ? []
          : url.endsWith("readiness")
            ? {
                enforced: false,
                candidates: 0,
                requests: 0,
                terms: 0,
                passages: 0,
              }
            : {
                summary: { approved: 0, active: 0, readings: 0, returning: 0 },
                attention: [],
                content: [],
                chart: [],
                unassigned: 0,
              },
    })),
  );
  mount();
  await screen.findByText("Approved candidates");
  expect(screen.queryByRole("link", { name: "Usage" })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Enable domain access" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText("No candidates need a follow-up."),
  ).toBeInTheDocument();
});
it("preserves loading and retry states", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(Error("Service unavailable")),
  );
  mount();
  expect(screen.getByRole("status")).toHaveTextContent("Loading workspace");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Service unavailable",
  );
});

const analytics = {
  summary: { approved: 0, active: 0, readings: 0, returning: 0 },
  attention: [], content: [], chart: [], unassigned: 0,
};
const usage = { month: "2026-09", users: [{
  id: 2, name: "Test candidate", reserved_seconds: 60, remaining_seconds: 1740,
  azure_success: 1, fallbacks: 0, failed: 0, pending: 0,
}] };
function mockStaffFetch(getUsage: () => Promise<any>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const data = url.endsWith("usage") ? await getUsage()
      : url.endsWith("domains") ? []
      : url.endsWith("readiness") ? { enforced: true }
      : analytics;
    return { ok: true, json: async () => data };
  }));
}
it("navigates between overview and usage without reusing incompatible data", async () => {
  let finish!: (value: any) => void;
  mockStaffFetch(() => new Promise(resolve => { finish = resolve; }));
  mount("admin");
  await screen.findByText("Approved candidates");
  fireEvent.click(screen.getByRole("link", { name: "Usage" }));
  expect(screen.getByRole("status")).toHaveTextContent("Loading workspace");
  expect(screen.queryByText("Approved candidates")).not.toBeInTheDocument();
  finish(usage);
  await screen.findByText("Azure allowance · 2026-09 UTC");
  expect(screen.getByText("1.0 min reserved · 29.0 min remaining")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Overview" }));
  await screen.findByText("Approved candidates");
  expect(screen.queryByText("Test candidate")).not.toBeInTheDocument();
});
it("loads a direct usage link and recovers from a failed request", async () => {
  const getUsage = vi.fn().mockRejectedValueOnce(Error("Usage unavailable"))
    .mockResolvedValue(usage);
  mockStaffFetch(getUsage);
  mount("admin", "/staff/usage");
  expect(await screen.findByRole("alert")).toHaveTextContent("Usage unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("Azure allowance · 2026-09 UTC");
  expect(getUsage).toHaveBeenCalledTimes(2);
});
it("redirects editors away from direct usage links", async () => {
  mockStaffFetch(async () => usage);
  mount("manager", "/staff/usage");
  await screen.findByText("Approved candidates");
  expect(screen.queryByText("Azure allowance · 2026-09 UTC")).not.toBeInTheDocument();
});
