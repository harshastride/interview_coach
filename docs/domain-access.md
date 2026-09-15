# Domain access and staff workspace

The four initial learning domains are Python Development, Java Development, Azure Data Engineering and AWS Data Engineering. Domains are separate from permission roles.

| Capability | Candidate | Editor (`manager`) | Admin |
| --- | --- | --- | --- |
| Request a learning domain | First request only | — | — |
| Practise approved content | Assigned domain | All domains | All domains |
| View personal historical reports | Yes | Yes | Yes |
| Coach candidates and inspect reports | No | All domains | All domains |
| Approve/reject requests, assign candidate domains | No | Yes | Yes |
| Upload/edit/classify/archive content | No | Yes | Yes |
| Manage permission roles and domains | No | No | Yes |
| View usage/allowances and activate restrictions | No | No | Yes |

## Request lifecycle

The first Request Access form collects name, optional reason and exactly one active domain. Login itself does not contain a domain selector. Pending and rejected requests retain their selection. A rejected candidate can resubmit without changing the domain; staff can correct pending/rejected requests. After approval, future visits open the assigned domain automatically. Staff change approved assignments from Candidates. All decisions are audited and processed in transactions; repeated decisions fail rather than granting access twice.

## Safe rollout

Schema initialization is additive and repeatable on startup. Existing access requests using `user_id` are backfilled with their known email; content and candidate domains are never inferred. Existing approved candidates keep access during preparation.

1. Open **Staff workspace → Candidates** and assign approved candidates to domains.
2. Review **Access requests**, including old requests missing a domain.
3. Open **Content**. Select Reading passages or Flashcards & quizzes, then filter **Needs classification**. Use page selection and domain checkboxes to classify up to 50 items per page. Shared material can have multiple domains. Archive unused content.
4. The Overview readiness checklist must show zero outstanding items. An admin can then select **Enable domain access**.

Activation invalidates old sessions. After activation, new uploads require domains and active content cannot lose its last active assignment. Deactivation of a domain with approved candidates or pending requests is blocked; in enforced mode content must also remain classified. Changing a region or domain name never changes Azure configuration.

## Interfaces and storage

Authenticated bootstrap includes `domainId`, `domainName`, `accessScope` and request status. `/api/domains` returns active choices; GET `/api/access-request` returns the current user's last request and POST accepts `name`, `reason`, and a first-request `domainId`.

Staff APIs live under `/api/staff`: analytics, candidates' reports, individual reports, requests/decisions, candidate domain assignment, content classification/editing, domains, readiness, enforce and usage. Existing content upload URLs under `/api/admin` now require a `domainIds` array, including bulk CSV uploads. Editors cannot use admin-only usage or role routes. Old request administration URLs direct callers to the staff workspace.

Candidate content responses include stable numeric IDs. Reading analysis/save sends `contentId`; the server verifies current access and resolves the reference passage. Session data includes identity/domain version metadata; scope changes clear or reject stale sessions. Staff role changes also increment access versions. Content responses are uncached, and obsolete bootstrap storage is removed. No bundled content fallback is introduced.

New domain tables use RLS with no client-role policies: this app accesses Postgres through its server connection, not Supabase browser authentication. Public/client grants on protected content and access tables are revoked. Keep database credentials server-side.

## Analytics definitions

Learning reports default to the last 30 India calendar days, with a seven-day option. Active candidates have recorded a reading, card review activity or quiz activity in the period; login alone does not count. Returning readers read on at least two dates. Repeat readings are attempts beyond the first per candidate and passage in the period. Attention lists use seven days since practice, or seven days since approval for candidates who have never practised. Existing candidates with unknown approval time start this clock at migration rather than receiving an invented historic approval date.

Old reading records remain unassigned. Existing daily activity is copied once with a null domain. These can appear in all-domain history; domain filters exclude them. New activity and reading records preserve their submission domain after reassignment. Learning aggregates exclude staff and the development bypass identity.

Reading trends use the latest 50 candidate reports and require matching content ID, reference hash, provider, version and locale. Missing scores or legacy metadata do not produce a trend. Passage edits therefore cannot silently change the comparison baseline. No interview readiness, technical competence or personality scores are inferred.

Admin Usage shows UTC-month reserved audio seconds, remaining allowance, successful Azure reports, local fallbacks, failed jobs and pending jobs. It is not an Azure invoice. The 30-minute allowance and existing checkpoint cadence are unchanged; no currency estimates or quota-editing feature are added.

## Verification

Run `npm test`, `npm run lint`, and `npm run build`. With the development database available, run `node --import tsx scripts/verify-domains.ts`. This uses temporary tables in a rolled-back transaction to test requests, approvals, shared-content access, reference lookup, historical attribution, analytics and stale-client denial. It never changes live assignments or the live enforcement flag.

UI verification includes desktop 1280×800, mobile 390px, keyboard-operable controls, direct staff/report URLs, missing reports, browser back, loading, empty and retry states. Layout uses the existing application tokens, with restrained component patterns inspired by [21st.dev](https://21st.dev/); no external registry script is executed in the application.

## Coach-assigned reading

Admins and editors can assign an active passage with a note (up to 1,000 characters) from a candidate detail page or saved report. Assignments require an approved candidate with an active domain and a passage explicitly classified in that domain, including during preparation mode. Staff can cancel pending assignments; duplicate pending assignments for the same candidate/passage are rejected.

Candidates see one pending assignment on home, with the full list at `/reading/assignments`. Completing a newly saved reading of the same passage in the assigned domain atomically completes the pending assignment and links the report. Replayed save requests do not complete newer assignments. Completion requires a server-issued receipt for the same user, passage, domain and reference hash, created no earlier than the assignment. Scores and transcript come from the receipt rather than client fields. Each receipt can produce only one saved attempt. Completion records practice, not competence. Domain/content changes make incompatible pending assignments unavailable; completed history is retained. Search, status filters and five-item pagination run on the server across the complete assignment history; totals and page rows use the same query snapshot. Load errors and failed action retries are distinct.

Startup adds private `reading_assignments` with RLS and revoked public/client-role access, plus indexes. The table is only accessed through authenticated server routes in `src/server/domain/assignments.ts`. Creation and cancellation are audited. Existing preparation-mode assignments are never guessed.
