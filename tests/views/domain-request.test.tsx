import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AccessDeniedScreen from "../../src/views/AccessDeniedScreen";
const user = {
  id: 1,
  name: "Reader",
  email: "reader@test.invalid",
  role: "viewer",
  isAllowed: false,
  avatar_url: null,
};
afterEach(() => vi.unstubAllGlobals());
function setup(existing: any) {
  const fetchMock = vi.fn(async (url: string, opts?: any) => ({
    ok: true,
    json: async () =>
      url === "/api/domains"
        ? [{ id: 2, name: "Python Development" }]
        : opts
          ? { ok: true }
          : existing,
  }));
  vi.stubGlobal("fetch", fetchMock);
  render(<AccessDeniedScreen user={user} onLogout={() => {}} />);
  return fetchMock;
}
it("requires a domain only on the first request form", async () => {
  const f = setup(null);
  const select = await screen.findByLabelText("Learning domain");
  expect(select).toBeRequired();
  fireEvent.change(select, { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
  await waitFor(() =>
    expect(
      f.mock.calls.some(
        ([u, o]: any) =>
          u === "/api/access-request" &&
          o?.method === "POST" &&
          JSON.parse(o.body).domainId === 2,
      ),
    ).toBe(true),
  );
});
it("restores pending request status without showing domain selection", async () => {
  setup({ status: "pending", domain_name: "Python Development", domain_id: 2 });
  await screen.findByText("Awaiting review");
  expect(screen.queryByLabelText("Learning domain")).not.toBeInTheDocument();
  expect(screen.queryByText("Submit request")).not.toBeInTheDocument();
});
it("resubmits a rejected request without sending another domain", async () => {
  const f = setup({
    status: "rejected",
    domain_name: "Python Development",
    domain_id: 2,
  });
  fireEvent.click(
    await screen.findByRole("button", { name: "Resubmit request" }),
  );
  await waitFor(() => {
    const call = f.mock.calls.find(([, o]: any) => o?.method === "POST");
    expect(call).toBeTruthy();
    expect(JSON.parse((call as any)[1].body)).not.toHaveProperty("domainId");
  });
});
it("shows retry after a loading error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(Error("Connection unavailable")),
  );
  render(<AccessDeniedScreen user={user} onLogout={() => {}} />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Connection unavailable",
  );
  expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
});
