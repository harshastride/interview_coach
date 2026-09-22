import PracticeAssignments from '../components/PracticeAssignments';
import React, { useEffect, useState } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Users,
  BookOpen,
  Activity,
  Repeat2,
  ArrowUpRight,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { AppLayout } from "../components/GlobalNav";
import { useBottomNav } from "./shared";
import type { AuthUser } from "../hooks/useAuth";
import ReadingReport from "../components/ReadingReport";
import AdminPanel from "../components/AdminPanel";
const panel =
  "rounded-2xl border border-[var(--stint-border)] bg-[var(--stint-bg-card)]";
const control =
  "rounded-xl border border-[var(--stint-border)] bg-[var(--stint-bg)] px-3 py-2 text-sm min-w-0";
const button =
  "rounded-xl bg-[var(--stint-primary)] text-white px-4 py-2 text-sm font-medium disabled:opacity-50";
const date = (d: any) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
      })
    : "No practice yet";
async function api(path: string, body?: any, method = "POST") {
  const r = await fetch("/api/staff/" + path, {
    ...(body !== undefined ? { method, body: JSON.stringify(body) } : {}),
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Unable to load this page.");
  return d;
}
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-10 text-center text-sm text-[var(--stint-text-muted)]">
      {children}
    </p>
  );
}
function DomainPicker({
  domains,
  value,
  onChange,
  label = "Learning domain",
}: {
  domains: any[];
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  return (
    <label className="text-xs text-[var(--stint-text-muted)]">
      {label}
      <select
        aria-label={label}
        className={`${control} block mt-1 w-full`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose domain</option>
        {domains
          .filter((d) => d.active)
          .map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
      </select>
    </label>
  );
}
type StaffWorkspaceProps = {
  user: AuthUser | null;
  onContentRefresh: () => void;
};

export default function StaffWorkspace(props: StaffWorkspaceProps) {
  const location = useLocation();
  // Each route has its own response shape; never render a previous route's data.
  return (
    <StaffWorkspacePage
      key={`${props.user?.id}:${props.user?.role}:${location.pathname}:${location.search}`}
      {...props}
    />
  );
}

function StaffWorkspacePage({
  user,
  onContentRefresh,
}: StaffWorkspaceProps) {
  const nav = useNavigate(),
    bottomNav = useBottomNav("home");
  const { section = "overview", candidateId, reportId } = useParams();
  const [params, setParams] = useSearchParams();
  const days = params.get("days") === "7" ? "7" : "30",
    domain = params.get("domain") ?? "";
  const usageMonth = params.get("month") || new Date().toISOString().slice(0, 7);
  const usageSort = params.get("sort") || "reserved";
  const [data, setData] = useState<any>(null),
    [insights, setInsights] = useState<any[]>([]),
    [domains, setDomains] = useState<any[]>([]),
    [ready, setReady] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [search, setSearch] = useState(params.get("search") ?? ""),
    [kind, setKind] = useState(
      params.get("kind") === "terms" ? "terms" : "interview",
    ),
    [selected, setSelected] = useState<number[]>([]),
    [selectedDomains, setSelectedDomains] = useState<number[]>([]),
    [edit, setEdit] = useState<any>(null),
    [manage, setManage] = useState(false),
    [newDomain, setNewDomain] = useState(""),
    [page, setPage] = useState(1),
    [queue, setQueue] = useState("all");
  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [search, kind, domain, queue]);
  const admin = user?.role === "admin";
  const staff = admin || user?.role === "manager";
  useEffect(() => {
    if (!staff) return;
    let active = true;
    setLoading(true);
    setData(null);
    setError("");
    setSelected([]);
    const query = `days=${days}${domain ? "&domainId=" + domain : ""}`;
    const endpoint = reportId
      ? `reports/${reportId}`
      : candidateId
        ? `candidates/${candidateId}/reports?${query}`
        : section === "domains"
          ? "domains"
          : section === "requests"
          ? "requests"
          : section === "content"
            ? `content?kind=${kind}`
            : section === "usage"
              ? (params.has("month") ? `usage?month=${encodeURIComponent(usageMonth)}` : "usage")
              : `analytics?${query}`;
    Promise.all([
      api(endpoint),
      api("domains"),
      api("readiness"),
      section === "content" ? api(`analytics?${query}`) : Promise.resolve(null),
    ])
      .then(([d, ds, r, insight]) => {
        if (active) {
          setData(d);
          setInsights(insight?.content ?? []);
          setDomains(ds);
          setReady(r);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [section, candidateId, reportId, days, domain, reload, kind, staff, usageMonth]);
  async function mutate(path: string, body: any, method = "POST") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(path, body, method);
      setMessage("Changes saved.");
      setReload((v) => v + 1);
      onContentRefresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!staff) return <Navigate to="/" replace />;
  if (["usage", "domains"].includes(section) && !admin)
    return <Navigate to="/staff/overview" replace />;
  const tabs = [
    ["overview", "Overview"],
    ["candidates", "Candidates"],
    ["content", "Content"],
    ["requests", "Access requests"],
    ...(admin ? [["usage", "Usage"], ["domains", "Domains"]] : []),
  ];
  const filtered = Array.isArray(data)
    ? data.filter((r) =>
        JSON.stringify([r.name, r.email, r.question, r.t, r.domain_name])
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
    : [];
  const visibleContent = filtered.filter(
    (r) =>
      (!domain || r.domain_ids?.includes(Number(domain))) &&
      (queue === "all" ||
        (queue === "unassigned" && !r.archived && !r.domain_ids?.length) ||
        (queue === "archived" && r.archived)),
  );
  const pageContent = visibleContent.slice((page - 1) * 50, page * 50);
  const selectedCandidate = params.get("candidate") ?? "";
  const usageCandidates = [...(data?.users ?? [])].sort((a: any, b: any) =>
    (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" }) || a.id - b.id,
  );
  const usageMatches = (data?.users ?? []).filter((u: any) =>
    (!selectedCandidate || String(u.id) === selectedCandidate) &&
    (u.name ?? "").toLowerCase().includes(search.trim().toLowerCase()),
  );
  usageMatches.sort((a: any, b: any) => {
    const nameOrder = (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" }) || a.id - b.id;
    // User IDs are allocated when accounts are added; login time is not creation order.
    if (usageSort === "recent") return b.id - a.id;
    if (usageSort === "name") return nameOrder;
    if (usageSort === "remaining") return a.remaining_seconds - b.remaining_seconds || nameOrder;
    return b.reserved_seconds - a.reserved_seconds || nameOrder;
  });
  function changeUsageFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    if (search && key !== "candidate") next.set("search", search); else next.delete("search");
    setParams(next);
  }
  const usagePages = Math.max(1, Math.ceil(usageMatches.length / 10));
  const usagePage = Math.min(page, usagePages);
  return (
    <AppLayout
      topBar={{
        sectionLabel: admin ? "Admin workspace" : "Editor workspace",
        showBack: true,
        onBack: () => nav("/"),
        onHome: () => nav("/"),
      }}
      bottomNav={bottomNav}
    >
      <div className="mx-auto w-full max-w-7xl p-4 md:p-7 space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link to="/" className="text-xs text-[var(--stint-text-muted)]">
              ← Back to practice
            </Link>
            <p className="mt-4 text-xs font-bold uppercase tracking-[.16em] text-[var(--stint-primary)]">
              Learning operations
            </p>
            <h1 className="mt-2 text-2xl md:text-3xl font-semibold tracking-tight">
              {reportId
                ? "Reading report"
                : candidateId
                  ? (data?.candidate?.name ?? "Candidate progress")
                  : (tabs.find((t) => t[0] === section)?.[1] ?? "Overview")}
            </h1>
            <p className="mt-2 text-sm text-[var(--stint-text-muted)]">
              Turn practice into progress, one clear next step at a time.
            </p>
          </div>
          <button className={control} onClick={() => setManage(true)}>
            <SlidersHorizontal size={15} className="inline mr-2" />
            {admin ? "Manage users & uploads" : "Upload content"}
          </button>
        </header>
        <nav
          aria-label="Staff workspace"
          className="flex flex-wrap gap-2 border-b border-[var(--stint-border)] pb-3"
        >
          {tabs.map(([key, label]) => (
            <Link
              key={key}
              to={`/staff/${key}`}
              className={`rounded-xl px-4 py-2 text-sm font-medium ${section === key && !candidateId && !reportId ? "bg-[var(--stint-primary)] text-white" : "text-[var(--stint-text-muted)] hover:bg-[var(--stint-bg-card)]"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        {!(reportId || candidateId) && !["usage", "domains"].includes(section) && (
          <div className="flex flex-wrap gap-3 items-end">
            {["overview", "candidates"].includes(section) && (
              <label className="text-xs text-[var(--stint-text-muted)]">
                Period
                <select
                  aria-label="Period"
                  className={`${control} mt-1 block`}
                  value={days}
                  onChange={(e) => setParams({ days: e.target.value, domain })}
                >
                  <option value="30">Last 30 days</option>
                  <option value="7">Last 7 days</option>
                </select>
              </label>
            )}
            <label className="text-xs text-[var(--stint-text-muted)]">
              Domain
              <select
                aria-label="Domain filter"
                className={`${control} mt-1 block max-w-full`}
                value={domain}
                onChange={(e) => setParams({ days, domain: e.target.value })}
              >
                <option value="">All domains</option>
                {domains.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-[var(--stint-text-muted)] pb-2">
              Activity dates use India time.
            </p>
          </div>
        )}
        {error && (
          <div role="alert" className={`${panel} p-4 text-sm text-red-600`}>
            {error}{" "}
            <button
              className="underline ml-3"
              onClick={() => setReload((v) => v + 1)}
            >
              Try again
            </button>
          </div>
        )}
        {message && (
          <p role="status" className="text-sm text-emerald-600">
            {message}
          </p>
        )}
        {loading ? (
          <div role="status" className={`${panel} p-10 text-sm`}>
            Loading workspace…
          </div>
        ) : (
          data && (
            <>
              {reportId ? (
                <>
                  <Link
                    className="text-sm text-[var(--stint-primary)]"
                    to="/staff/candidates"
                  >
                    ← Back to candidates
                  </Link>
                  <ReadingReport report={data} />
                  <PracticeAssignments key={data.user_id} staffCandidateId={data.user_id} initialContentId={data.content_id} />
                </>
              ) : candidateId ? (
                <>
                  <Link
                    className="text-sm text-[var(--stint-primary)]"
                    to="/staff/candidates"
                  >
                    ← Back to candidates
                  </Link>
                  {(() => {
                    const attempts = data.attempts ?? [];
                    const latest = attempts[0];
                    const last10Scores = attempts
                      .slice(0, 10)
                      .map((a: any) => a.overall_score)
                      .filter((s: any): s is number => s != null);
                    const avgLast10 = last10Scores.length
                      ? Math.round(
                          last10Scores.reduce((s: number, n: number) => s + n, 0) /
                            last10Scores.length,
                        )
                      : null;
                    const last10Paces = attempts
                      .slice(0, 10)
                      .map((a: any) => a.wpm)
                      .filter((w: any): w is number => w != null);
                    const avgPaceLast10 = last10Paces.length
                      ? Math.round(
                          last10Paces.reduce((s: number, n: number) => s + n, 0) /
                            last10Paces.length,
                        )
                      : null;
                    return (
                      <>
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                          {[
                            [
                              "Saved readings",
                              attempts.length === 50
                                ? "50 most recent"
                                : String(attempts.length),
                              "Candidate's recent practice history",
                            ],
                            [
                              "Passages practised",
                              String(
                                new Set(attempts.map((a: any) => a.question_ref)).size,
                              ),
                              "Across the readings shown",
                            ],
                            [
                              "Latest reading score",
                              latest?.overall_score == null
                                ? "—"
                                : `${latest.overall_score}/100`,
                              "An estimate for one attempt",
                            ],
                            [
                              "Latest reading pace",
                              latest?.wpm == null ? "—" : `${latest.wpm} wpm`,
                              "Speed is only part of fluency",
                            ],
                          ].map(([label, value, description]) => (
                            <div key={label} className={`${panel} p-4 md:p-5`}>
                              <p className="text-xs text-[var(--stint-text-muted)]">
                                {label}
                              </p>
                              <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
                                {value}
                              </p>
                              <p className="mt-2 text-[11px] text-[var(--stint-text-muted)]">
                                {description}
                              </p>
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className={`${panel} p-4 md:p-5`}>
                            <p className="text-xs text-[var(--stint-text-muted)]">
                              Average score (last {last10Scores.length || 10} readings)
                            </p>
                            <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
                              {avgLast10 == null ? "—" : `${avgLast10}/100`}
                            </p>
                            <p className="mt-2 text-[11px] text-[var(--stint-text-muted)]">
                              Cumulative trend across recent readings, not just one attempt
                            </p>
                          </div>
                          <div className={`${panel} p-4 md:p-5`}>
                            <p className="text-xs text-[var(--stint-text-muted)]">
                              Average pace (last {last10Paces.length || 10} readings)
                            </p>
                            <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">
                              {avgPaceLast10 == null ? "—" : `${avgPaceLast10} wpm`}
                            </p>
                            <p className="mt-2 text-[11px] text-[var(--stint-text-muted)]">
                              Cumulative pace trend, smoothing out any one-off attempt
                            </p>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                  <section className={`${panel} p-5`}>
                    <h2 className="font-semibold">
                      Comparable reading progress
                    </h2>
                    <p className="mt-1 text-xs text-[var(--stint-text-muted)]">
                      Same passage, language and assessment method. Based on the
                      latest 50 saved readings.
                    </p>
                    {!data.trends?.length ? (
                      <Empty>Not enough comparable attempts yet.</Empty>
                    ) : (
                      data.trends.map((t: any, i: number) => (
                        <div
                          key={i}
                          className="mt-4 border-t border-[var(--stint-border)] pt-4"
                        >
                          <p className="text-sm">{t.question}</p>
                          <p className="mt-1 font-semibold">
                            {t.first} → {t.latest}{" "}
                            <span className="font-normal text-xs text-[var(--stint-text-muted)]">
                              {t.provider} · {t.locale} · {t.count} attempts
                            </span>
                          </p>
                        </div>
                      ))
                    )}
                  </section>
                  <section
                    className={`${panel} divide-y divide-[var(--stint-border)]`}
                  >
                    {!data.attempts?.length ? (
                      <Empty>No saved readings yet.</Empty>
                    ) : (
                      data.attempts.map((a: any) => (
                        <Link
                          className="p-5 flex gap-3 justify-between items-center"
                          key={a.id}
                          to={`/staff/reports/${a.id}`}
                        >
                          <div>
                            <p className="text-sm font-medium">
                              {a.question_ref}
                            </p>
                            <p className="text-xs text-[var(--stint-text-muted)] mt-1">
                              {date(a.created_at)} · Score{" "}
                              {a.overall_score ?? "—"}
                            </p>
                          </div>
                          <ArrowUpRight size={18} />
                        </Link>
                      ))
                    )}
                  </section>
                </>
              ) : section === "overview" ? (
                <>
                  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                    {[
                      ["Approved candidates", data.summary.approved, Users],
                      ["Active candidates", data.summary.active, Activity],
                      ["Completed readings", data.summary.readings, BookOpen],
                      ["Returning readers", data.summary.returning, Repeat2],
                    ].map(([label, value, Icon]: any) => (
                      <div key={label} className={`${panel} p-5`}>
                        <div className="flex gap-2 items-center text-[var(--stint-text-muted)]">
                          <Icon size={16} />
                          <span className="text-xs">{label}</span>
                        </div>
                        <p className="mt-4 text-3xl font-semibold tracking-tight">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="grid lg:grid-cols-3 gap-5">
                    <section className={`${panel} p-5 lg:col-span-2`}>
                      <h2 className="font-semibold">Practice activity</h2>
                      <p className="mt-1 text-xs text-[var(--stint-text-muted)]">
                        Completed readings per day
                      </p>
                      <div
                        className="mt-5 flex h-36 items-end gap-1"
                        role="img"
                        aria-label={data.chart
                          .map((d: any) => `${d.date}: ${d.readings} readings`)
                          .join("; ")}
                      >
                        {data.chart.map((d: any) => (
                          <div
                            key={d.date}
                            className="flex-1 min-w-0 rounded-t bg-[var(--stint-primary)]/75"
                            title={`${d.date}: ${d.readings} readings`}
                            style={{
                              height: `${Math.max(2, (d.readings / Math.max(1, ...data.chart.map((c: any) => c.readings))) * 100)}%`,
                            }}
                          />
                        ))}
                      </div>
                      <div className="mt-2 flex justify-between text-xs text-[var(--stint-text-muted)]">
                        <span>{data.chart[0]?.date}</span>
                        <span>{data.chart.at(-1)?.date}</span>
                      </div>
                      <p className="mt-5 text-sm">
                        {data.chart.reduce(
                          (s: number, d: any) => s + d.cards,
                          0,
                        )}{" "}
                        cards studied ·{" "}
                        {data.chart.reduce(
                          (s: number, d: any) => s + d.quizzes,
                          0,
                        )}{" "}
                        quiz answers
                      </p>
                    </section>
                    <section className={`${panel} p-5`}>
                      <h2 className="font-semibold">Needs attention</h2>
                      <p className="mt-1 text-xs text-[var(--stint-text-muted)]">
                        No practice for at least seven days
                      </p>
                      {!data.attention.length ? (
                        <Empty>No candidates need a follow-up.</Empty>
                      ) : (
                        data.attention.slice(0, 8).map((u: any) => (
                          <Link
                            to={`/staff/candidates/${u.id}`}
                            className="flex items-center justify-between py-3 border-b border-[var(--stint-border)]"
                            key={u.id}
                          >
                            <div>
                              <p className="text-sm font-medium">{u.name}</p>
                              <p className="text-xs text-[var(--stint-text-muted)]">
                                {date(u.last_practice)}
                              </p>
                            </div>
                            <ArrowUpRight size={15} />
                          </Link>
                        ))
                      )}
                    </section>
                  </div>
                  {ready && (
                    <section className={`${panel} p-5`}>
                      <div className="flex gap-3 items-center">
                        <ShieldCheck className="text-[var(--stint-primary)]" />
                        <div>
                          <h2 className="font-semibold">
                            {ready.enforced
                              ? "Domain access is active"
                              : "Prepare domain access"}
                          </h2>
                          <p className="mt-1 text-xs text-[var(--stint-text-muted)]">
                            {ready.enforced
                              ? "Candidates see their assigned learning domain."
                              : "Existing candidates keep current access until preparation is complete."}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
                        {[
                          [
                            "Candidates to assign",
                            ready.candidates,
                            "candidates",
                          ],
                          ["Requests to assign", ready.requests, "requests"],
                          ["Terms to classify", ready.terms, "content"],
                          ["Passages to classify", ready.passages, "content"],
                        ].map(([l, n, path]) => (
                          <Link
                            to={`/staff/${path}${l === "Terms to classify" ? "?kind=terms" : ""}`}
                            key={l}
                            className="rounded-xl bg-[var(--stint-bg)] p-3 text-sm"
                          >
                            <strong>{n}</strong>
                            <p className="text-xs mt-1">{l}</p>
                          </Link>
                        ))}
                      </div>
                      {admin && !ready.enforced && (
                        <button
                          disabled={
                            busy ||
                            ready.candidates +
                              ready.requests +
                              ready.terms +
                              ready.passages >
                              0
                          }
                          className={button}
                          onClick={() => mutate("enforce", {})}
                        >
                          Enable domain access
                        </button>
                      )}
                    </section>
                  )}
                  <section className={`${panel} p-5`}>
                    <h2 className="font-semibold">
                      Passages receiving practice
                    </h2>
                    {!data.content.length ? (
                      <Empty>
                        Reading insights will appear after candidates practise.
                      </Empty>
                    ) : (
                      data.content.slice(0, 6).map((p: any, i: number) => (
                        <div
                          key={i}
                          className="py-4 border-b border-[var(--stint-border)]"
                        >
                          <p className="text-sm font-medium">{p.question}</p>
                          <p className="mt-1 text-xs text-[var(--stint-text-muted)]">
                            {p.attempts} readings · {p.readers} readers ·{" "}
                            {p.repeats} repeat attempts
                          </p>
                          {p.words.length > 0 && (
                            <p className="mt-2 text-xs">
                              Words to revisit:{" "}
                              {p.words
                                .map((w: any) => `${w[0]} (${w[1]})`)
                                .join(", ")}
                            </p>
                          )}
                          <Link
                            to="/staff/content"
                            className="text-xs text-[var(--stint-primary)]"
                          >
                            Review content →
                          </Link>
                        </div>
                      ))
                    )}
                  </section>
                  <p className="text-xs text-[var(--stint-text-muted)]">
                    {data.unassigned} readings in unassigned history. These are
                    excluded when filtering by domain. Legacy flashcard/quiz
                    activity appears only in all-domain totals.
                  </p>
                </>
              ) : section === "candidates" ? (
                <section className={`${panel} p-5`}>
                  <input
                    aria-label="Search candidates"
                    placeholder="Search candidates…"
                    className={`${control} w-full sm:max-w-sm mb-4`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="space-y-3">
                    {data.candidates
                      .filter((u: any) =>
                        `${u.name} ${u.email}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((u: any) => (
                        <article
                          key={u.id}
                          className="grid lg:grid-cols-[1fr_auto_260px] gap-4 items-center border-t border-[var(--stint-border)] pt-4"
                        >
                          <Link
                            className="min-w-0"
                            to={`/staff/candidates/${u.id}${domain ? "?domain=" + domain : ""}`}
                          >
                            <p className="font-medium text-sm">
                              {u.name}{" "}
                              <ArrowUpRight size={14} className="inline" />
                            </p>
                            <p className="text-xs text-[var(--stint-text-muted)] break-all mt-1">
                              {u.email}
                            </p>
                            <p className="text-xs mt-2">
                              {u.is_allowed ? "Approved" : "Awaiting access"} ·{" "}
                              {date(u.last_practice)}
                            </p>
                          </Link>
                          <p className="text-xs">
                            {u.reading_count} readings · {u.repeat_count}{" "}
                            repeats
                          </p>
                          <DomainPicker
                            domains={domains}
                            value={String(u.domain_id ?? "")}
                            label={`Domain for ${u.name}`}
                            onChange={(v) =>
                              v &&
                              mutate(
                                `candidates/${u.id}/domain`,
                                { domainId: Number(v) },
                                "PATCH",
                              )
                            }
                          />
                        </article>
                      ))}
                    {!data.candidates.length && (
                      <Empty>No candidates in this domain.</Empty>
                    )}
                  </div>
                </section>
              ) : section === "requests" ? (
                <section className={`${panel} p-5`}>
                  <input
                    aria-label="Search requests"
                    placeholder="Search requests…"
                    className={`${control} w-full sm:max-w-sm mb-4`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {filtered
                    .filter((r) => !domain || r.domain_id === Number(domain))
                    .map((r) => (
                      <article
                        key={r.id}
                        className="py-5 border-t border-[var(--stint-border)] grid lg:grid-cols-[1fr_260px] gap-4"
                      >
                        <div>
                          <div className="flex flex-wrap gap-2 items-center">
                            <h2 className="text-sm font-semibold">{r.name}</h2>
                            <span className="text-xs rounded-full bg-[var(--stint-bg)] px-2 py-1">
                              {r.status}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--stint-text-muted)] break-all mt-1">
                            {r.email} · {date(r.requested_at)}
                          </p>
                          <p className="text-sm mt-3">
                            {r.reason || "No reason provided."}
                          </p>
                          {r.status === "pending" && (
                            <div className="flex gap-2 mt-4">
                              <button
                                disabled={busy || !r.domain_id}
                                className={button}
                                onClick={() =>
                                  mutate(`requests/${r.id}/approve`, {})
                                }
                              >
                                Approve
                              </button>
                              <button
                                disabled={busy}
                                className={control}
                                onClick={() =>
                                  mutate(`requests/${r.id}/reject`, {})
                                }
                              >
                                Reject
                              </button>
                            </div>
                          )}
                        </div>
                        {r.status === "approved" ? (
                          <p className="text-sm">
                            {r.domain_name}
                            <span className="block text-xs mt-1 text-[var(--stint-text-muted)]">
                              Change assignment from Candidates.
                            </span>
                          </p>
                        ) : (
                          <DomainPicker
                            domains={domains}
                            value={String(r.domain_id ?? "")}
                            label={`Requested domain for ${r.name}`}
                            onChange={(v) =>
                              v &&
                              mutate(
                                `requests/${r.id}/domain`,
                                { domainId: Number(v) },
                                "PATCH",
                              )
                            }
                          />
                        )}
                      </article>
                    ))}
                  {!filtered.length && <Empty>No access requests.</Empty>}
                </section>
              ) : section === "usage" ? (
                <section className={`${panel} p-5`}>
                  <h2 className="font-semibold">
                    Azure allowance · {data.month} UTC
                  </h2>
                  <p className="mt-2 text-sm text-[var(--stint-text-muted)]">
                    Reserved audio allowance, not actual billing. Each candidate
                    has 30 minutes per month. Uncertain submissions retain their
                    reservation.
                  </p>
                  <div className="mt-5 flex flex-wrap items-end gap-3">
                    <label className="text-sm font-medium min-w-0">
                      Month (UTC)
                      <input type="month" className={`${control} mt-2 block w-full`} value={usageMonth}
                        onInput={(e) => { const value = e.currentTarget.value; if (/^[1-9][0-9]{3}-(0[1-9]|1[0-2])$/.test(value)) changeUsageFilter("month", value); }} />
                    </label>
                    <label className="text-sm font-medium min-w-0">
                      Sort by
                      <select className={`${control} mt-2 block w-full`} value={usageSort}
                        onChange={(e) => changeUsageFilter("sort", e.target.value)}>
                        <option value="reserved">Most reserved minutes</option>
                        <option value="remaining">Least allowance remaining</option>
                        <option value="name">Name A–Z</option>
                        <option value="recent">Recently added</option>
                      </select>
                    </label>
                    <label className="flex-1 min-w-0 text-sm font-medium">
                      Candidate
                      <select className={`${control} mt-2 block w-full`} value={selectedCandidate}
                        onChange={(e) => changeUsageFilter("candidate", e.target.value)}>
                        <option value="">All candidates</option>
                        {usageCandidates.map((u: any) => (
                          <option key={u.id} value={String(u.id)}>
                            {u.name}{usageCandidates.some((other: any) => other.id !== u.id && other.name === u.name) ? ` (ID ${u.id})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex-1 min-w-0 text-sm font-medium">
                      Search by name
                      <input
                        type="search"
                        className={`${control} mt-2 block w-full`}
                        placeholder="Type a candidate’s name…"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                      />
                    </label>
                    {search && <button className={control} onClick={() => { setSearch(""); setPage(1); }}>Clear search</button>}
                  </div>
                  <p className="mt-3 text-xs text-[var(--stint-text-muted)]" role="status" aria-live="polite">
                    {usageMatches.length ? `${(usagePage - 1) * 10 + 1}–${Math.min(usagePage * 10, usageMatches.length)} of ${usageMatches.length} people` : "0 people"}
                  </p>
                  {!usageMatches.length && <Empty>{search.trim() ? "No matching names. Try another name or clear your search." : "No usage records yet."}</Empty>}
                  {usageMatches.slice((usagePage - 1) * 10, usagePage * 10).map((u: any) => (
                    <div
                      key={u.id}
                      className="mt-5 border-t border-[var(--stint-border)] pt-4"
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <p className="text-sm font-medium">{u.name}</p>
                        <p className="text-sm">
                          {(u.reserved_seconds / 60).toFixed(1)} min reserved ·{" "}
                          {(u.remaining_seconds / 60).toFixed(1)} min remaining
                        </p>
                      </div>
                      <div className="h-2 bg-[var(--stint-bg)] rounded-full mt-3 overflow-hidden">
                        <div
                          className="h-full bg-[var(--stint-primary)]"
                          style={{
                            width: Math.min(100, u.reserved_seconds / 18) + "%",
                          }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-[var(--stint-text-muted)]">
                        {u.azure_success} Azure reports · {u.fallbacks} local
                        fallbacks · {u.failed} failed · {u.pending} pending
                      </p>
                    </div>
                  ))}
                  {usagePages > 1 && <nav aria-label="Usage pages" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--stint-border)] pt-4">
                    <button className={control} disabled={usagePage === 1} onClick={() => setPage(usagePage - 1)}>Previous</button>
                    <span className="text-sm">Page {usagePage} of {usagePages}</span>
                    <button className={control} disabled={usagePage === usagePages} onClick={() => setPage(usagePage + 1)}>Next</button>
                  </nav>}
                </section>
              ) : section === "content" ? (
                <>
                  <section className={`${panel} p-5`}>
                    <div className="flex flex-wrap gap-3">
                      <select
                        aria-label="Content type"
                        className={control}
                        value={kind}
                        onChange={(e) => {
                          setKind(e.target.value);
                          setEdit(null);
                        }}
                      >
                        <option value="interview">Reading passages</option>
                        <option value="terms">Flashcards & quizzes</option>
                      </select>
                      <input
                        aria-label="Search content"
                        className={control}
                        value={search}
                        placeholder="Search content…"
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      <button
                        className={control}
                        onClick={() => setManage(true)}
                      >
                        Create or upload content
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-4">
                      <select
                        aria-label="Content status"
                        className={control}
                        value={queue}
                        onChange={(e) => setQueue(e.target.value)}
                      >
                        <option value="all">All content</option>
                        <option value="unassigned">Needs classification</option>
                        <option value="archived">Archived</option>
                      </select>
                      <button
                        className={control}
                        onClick={() =>
                          setSelected(pageContent.map((r) => r.id))
                        }
                      >
                        Select this page
                      </button>
                      <button
                        className={control}
                        onClick={() => setSelected([])}
                      >
                        Clear selection
                      </button>
                    </div>
                    <p className="mt-4 text-xs text-[var(--stint-text-muted)]">
                      Select items below to assign shared domains or archive.
                      Unassigned items form your preparation queue.
                    </p>
                    <div className="flex flex-wrap gap-3 my-4">
                      {domains
                        .filter((d) => d.active)
                        .map((d) => (
                          <label
                            key={d.id}
                            className="text-xs flex items-center gap-2"
                          >
                            <input
                              type="checkbox"
                              checked={selectedDomains.includes(d.id)}
                              onChange={(e) =>
                                setSelectedDomains(
                                  e.target.checked
                                    ? [...selectedDomains, d.id]
                                    : selectedDomains.filter((v) => v !== d.id),
                                )
                              }
                            />
                            {d.name}
                          </label>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        disabled={!selected.length || busy}
                        className={button}
                        onClick={() =>
                          mutate(
                            `content/${kind}`,
                            { ids: selected, domainIds: selectedDomains },
                            "PATCH",
                          )
                        }
                      >
                        Assign domains ({selected.length})
                      </button>
                      <button
                        disabled={!selected.length || busy}
                        className={control}
                        onClick={() =>
                          mutate(
                            `content/${kind}`,
                            { ids: selected, archived: true },
                            "PATCH",
                          )
                        }
                      >
                        Archive
                      </button>
                      <button
                        disabled={!selected.length || busy}
                        className={control}
                        onClick={() =>
                          mutate(
                            `content/${kind}`,
                            { ids: selected, archived: false },
                            "PATCH",
                          )
                        }
                      >
                        Restore
                      </button>
                    </div>
                    {pageContent.map((r) => (
                      <div
                        key={r.id}
                        className="mt-4 pt-4 border-t border-[var(--stint-border)] flex gap-3"
                      >
                        <input
                          aria-label={`Select ${r.question ?? r.t}`}
                          type="checkbox"
                          checked={selected.includes(r.id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, r.id]
                                : selected.filter((v) => v !== r.id),
                            )
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium break-words">
                            {r.question ?? r.t}
                          </p>
                          <p className="text-xs text-[var(--stint-text-muted)] mt-1">
                            {r.archived ? "Archived · " : ""}
                            {r.domain_ids.length
                              ? r.domain_ids
                                  .map(
                                    (id: number) =>
                                      domains.find((d) => d.id === id)?.name,
                                  )
                                  .join(" · ")
                              : "Unassigned — needs classification"}
                          </p>
                          {kind === "interview" && (
                            <p className="mt-2 text-xs">
                              {insights.find((p) => p.id === r.id)?.attempts ??
                                0}{" "}
                              readings ·{" "}
                              {insights.find((p) => p.id === r.id)?.readers ??
                                0}{" "}
                              readers ·{" "}
                              {insights.find((p) => p.id === r.id)?.repeats ??
                                0}{" "}
                              repeats in {days} days
                              {insights.find((p) => p.id === r.id)?.words
                                ?.length > 0 && (
                                <span className="block mt-1 text-[var(--stint-text-muted)]">
                                  Revisit:{" "}
                                  {insights
                                    .find((p) => p.id === r.id)
                                    .words.map((w: any) => `${w[0]} (${w[1]})`)
                                    .join(", ")}
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                        <button
                          className="text-xs text-[var(--stint-primary)]"
                          onClick={() => setEdit({ ...r })}
                        >
                          Edit
                        </button>
                      </div>
                    ))}
                    {!visibleContent.length && (
                      <Empty>No matching content.</Empty>
                    )}
                    <div className="flex flex-wrap items-center gap-3 mt-5 text-xs">
                      <button
                        className={control}
                        disabled={page === 1}
                        onClick={() => {
                          setPage((p) => p - 1);
                          setSelected([]);
                        }}
                      >
                        Previous
                      </button>
                      <span>
                        Page {page} of{" "}
                        {Math.max(1, Math.ceil(visibleContent.length / 50))} ·{" "}
                        {visibleContent.length} items
                      </span>
                      <button
                        className={control}
                        disabled={page * 50 >= visibleContent.length}
                        onClick={() => {
                          setPage((p) => p + 1);
                          setSelected([]);
                        }}
                      >
                        Next
                      </button>
                    </div>
                    {edit && (
                      <form
                        className="mt-5 space-y-3 rounded-xl border border-[var(--stint-border)] p-4"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (
                            await mutate(
                              `content/${kind}/${edit.id}`,
                              edit,
                              "PATCH",
                            )
                          )
                            setEdit(null);
                        }}
                      >
                        <h2 className="font-semibold">Edit content</h2>
                        {(kind === "terms"
                          ? ["t", "d", "c", "l"]
                          : [
                              "question",
                              "ideal_answer",
                              "role",
                              "company",
                              "category",
                            ]
                        ).map((key) => (
                          <label key={key} className="block text-xs">
                            {
                              {
                                t: "Term",
                                d: "Definition",
                                c: "Category",
                                l: "Level",
                                question: "Question",
                                ideal_answer: "Answer",
                                role: "Role",
                                company: "Company",
                                category: "Category",
                              }[key]
                            }
                            <textarea
                              required
                              className={`${control} block mt-1 w-full`}
                              value={edit[key]}
                              onChange={(e) =>
                                setEdit({ ...edit, [key]: e.target.value })
                              }
                            />
                          </label>
                        ))}
                        <button className={button} disabled={busy}>
                          Save content
                        </button>
                        <button
                          type="button"
                          className={`${control} ml-2`}
                          onClick={() => setEdit(null)}
                        >
                          Cancel
                        </button>
                      </form>
                    )}
                  </section>

                </>
              ) : section === "domains" && admin ? (

                    <section className={`${panel} p-5`}>
                      <h2 className="font-semibold">Learning domains</h2><p className="mt-2 text-sm text-[var(--stint-text-muted)]">Add, rename or deactivate domains. Reassign approved candidates and pending requests first; active content must keep an active domain when restrictions are enabled.</p>
                      <form
                        className="flex flex-wrap gap-2 mt-4"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (await mutate("domains", { name: newDomain }))
                            setNewDomain("");
                        }}
                      >
                        <input
                          required
                          maxLength={100}
                          aria-label="New domain name"
                          className={control}
                          value={newDomain}
                          onChange={(e) => setNewDomain(e.target.value)}
                          placeholder="New domain name"
                        />
                        <button className={button} disabled={busy}>
                          Add domain
                        </button>
                      </form>
                      {domains.map((d) => (
                        <DomainRow
                          key={d.id + ":" + d.name}
                          d={d}
                          busy={busy}
                          save={(b: any) =>
                            mutate(`domains/${d.id}`, b, "PATCH")
                          }
                        />
                      ))}
                    </section>

              ) : null}
            </>
          )
        )}
        {manage && (
          <AdminPanel
            currentUser={user}
            onClose={() => {
              setManage(false);
              setReload((v) => v + 1);
            }}
            onContentRefresh={onContentRefresh}
          />
        )}
      </div>
    </AppLayout>
  );
}
function DomainRow({ d, busy, save }: any) {
  const [name, setName] = useState(d.name);
  return (
    <form
      className="flex flex-wrap gap-2 mt-4"
      onSubmit={(e) => {
        e.preventDefault();
        save({ name });
      }}
    >
      <span className="text-xs text-[var(--stint-text-muted)]">{d.active ? "Active" : "Inactive"} · {d.candidate_count ?? 0} candidates · {d.content_count ?? 0} active items</span>
      <input
        aria-label={`Rename ${d.name}`}
        required
        maxLength={100}
        className={`${control} flex-1`}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <button className={control} disabled={busy}>
        Rename
      </button>
      <button
        className={control}
        disabled={busy}
        type="button"
        onClick={() => save({ active: !d.active })}
      >
        {d.active ? "Deactivate" : "Activate"}
      </button>
    </form>
  );
}
