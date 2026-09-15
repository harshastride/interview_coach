import React, { useEffect, useState } from "react";
import { BookOpen, CheckCircle2, Clock3, LogOut } from "lucide-react";
import type { AuthUser } from "../hooks/useAuth";
export default function AccessDeniedScreen({
  user,
  onLogout,
}: {
  user: AuthUser | null;
  onLogout: () => void;
}) {
  const [name, setName] = useState(user?.name ?? ""),
    [reason, setReason] = useState(""),
    [domain, setDomain] = useState("");
  const [domains, setDomains] = useState<any[]>([]),
    [request, setRequest] = useState<any>(null),
    [status, setStatus] = useState("loading"),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus("loading");
    Promise.all(
      ["/api/domains", "/api/access-request"].map(async (u) => {
        const r = await fetch(u);
        if (!r.ok) throw Error("Unable to load access details.");
        return r.json();
      }),
    )
      .then(([d, r]) => {
        if (active) {
          setDomains(d);
          setRequest(r);
          setStatus("ready");
          setError("");
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, [retry]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    try {
      const r = await fetch("/api/access-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          name,
          reason,
          ...(!request ? { domainId: Number(domain) } : {}),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      setRetry((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
      setStatus("ready");
    }
  }
  const input =
    "w-full rounded-xl border border-[var(--stint-border)] bg-[var(--stint-bg)] px-4 py-3 text-sm";
  return (
    <main className="min-h-screen bg-[var(--stint-bg)] flex items-center justify-center p-5">
      <section className="w-full max-w-lg rounded-3xl border border-[var(--stint-border)] bg-[var(--stint-bg-card)] p-6 sm:p-9 shadow-sm">
        <BookOpen className="text-[var(--stint-primary)]" size={30} />
        <p className="mt-5 text-xs font-semibold tracking-widest uppercase text-[var(--stint-primary)]">
          Your learning journey
        </p>
        <h1 className="mt-2 text-2xl font-semibold">
          {request ? "Your access request" : "Request access"}
        </h1>
        <p className="mt-2 text-sm text-[var(--stint-text-muted)] break-all">
          {user?.email}
        </p>
        {error && (
          <div role="alert" className="mt-4 text-sm text-red-600">
            {error}
            <button
              onClick={() => setRetry((v) => v + 1)}
              className="ml-3 underline"
            >
              Try again
            </button>
          </div>
        )}
        {status === "loading" ? (
          <p role="status" className="my-6">
            Loading access details…
          </p>
        ) : (
          status !== "error" && (
            <>
              {request && (
                <div className="my-6 rounded-2xl border border-[var(--stint-border)] p-4">
                  <div className="flex gap-2 items-center font-medium">
                    {request.status === "approved" ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <Clock3 size={18} />
                    )}{" "}
                    {request.status === "pending"
                      ? "Awaiting review"
                      : request.status === "approved"
                        ? "Request approved"
                        : "Request not approved"}
                  </div>
                  <p className="mt-2 text-sm">
                    {request.domain_name ?? "Staff are assigning your domain."}
                  </p>
                  <p className="mt-2 text-xs text-[var(--stint-text-muted)]">
                    Your selected domain is saved. Contact an admin or editor to
                    change it.
                  </p>
                  {request.status === "approved" && (
                    <button
                      className="mt-3 underline"
                      onClick={() => window.location.replace("/")}
                    >
                      Check access
                    </button>
                  )}
                </div>
              )}
              {(!request || request.status === "rejected") && (
                <form onSubmit={submit} className="mt-6 space-y-4">
                  <label className="block text-sm">
                    Your name
                    <input
                      required
                      maxLength={200}
                      className={`${input} mt-2`}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  {!request && (
                    <label className="block text-sm">
                      Learning domain
                      <select
                        required
                        aria-label="Learning domain"
                        aria-describedby="request-domain-help"
                        className={`${input} mt-2`}
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                      >
                        <option value="">Choose one domain</option>
                        {domains.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <span
                        id="request-domain-help"
                        className="mt-2 block text-xs text-[var(--stint-text-muted)]"
                      >
                        Choose the path you want to practise. Our team will
                        review your request.
                      </span>
                    </label>
                  )}
                  <label className="block text-sm">
                    Reason for access{" "}
                    <span className="text-[var(--stint-text-muted)]">
                      (optional)
                    </span>
                    <textarea
                      maxLength={2000}
                      className={`${input} mt-2`}
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={
                      status === "sending" || (!request && !domains.length)
                    }
                    className="w-full rounded-xl bg-[var(--stint-primary)] py-3 text-white font-medium disabled:opacity-50"
                  >
                    {status === "sending"
                      ? "Submitting…"
                      : request
                        ? "Resubmit request"
                        : "Submit request"}
                  </button>
                </form>
              )}
            </>
          )
        )}
        <button
          onClick={onLogout}
          className="mt-6 flex items-center gap-2 text-sm text-[var(--stint-text-muted)]"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </section>
    </main>
  );
}
