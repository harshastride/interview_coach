# Interview Coach — UX/UI Redesign Plan

**Document type:** UX/UI redesign specification (no code)  
**App:** Interview Coach  
**Focus:** Layout, hierarchy, navigation (especially “always get Home”), logo-aligned visual system.

---

# Part 1 — Redesign Summary

**Vision:** A premium, clear learning product where users always know where they are and can return to Home in one tap from any screen, with a visual system derived from the brand palette (colors, shapes, tone) and consistent across desktop and mobile.

**Logo-derived palette:**
- **Primary:** `#4474B9` (main wordmark and shapes)
- **Primary dark:** `#0F6199` (accent dot, hover/pressed)
- **Secondary/accent:** `#4E8ACE` (mid-tone shapes)
- **Light:** `#75C4F3` (highlight shapes)
- **Background:** `#F2F7FC` (existing) — keep; add neutrals for text/surfaces

**Core changes:**
- **Navigation:** Persistent global nav (desktop: top bar with Home; mobile: bottom nav with Home always visible). Clear back vs Home behavior and rules for every screen.
- **Hierarchy:** One primary action per screen; secondary actions de-emphasized; content-first layout with a defined spacing and type scale.
- **Brand:** Color palette, type scale, and component style (cards, buttons, radius) defined from the logo and applied everywhere.
- **Flow:** No dead ends; predictable back/Home; obvious next steps on Home, topic selection, and end states (results, completion, empty, error).

---

# Part 2 — Section-by-Section Specs

## 1) UX Audit

**What’s weak today:**
- **Hierarchy:** Home is a full-screen choice; then topic selection; then content. No persistent “you are here” or global chrome, so hierarchy feels flat and context is easy to lose.
- **Spacing:** Ad-hoc spacing; no clear 4/8px grid or scale, which hurts rhythm and readability.
- **Readability:** Long question/answer text may lack a clear type scale or max line length.
- **CTA clarity:** “Start Interview,” “Start Flashcards,” “Next,” “Finish” compete with secondary actions without clear primary vs secondary treatment.
- **Flow friction:** “Back” sometimes means “back to topic selection” and sometimes “back to Home,” with only icon buttons; labels and rules are unclear.

**Top 10 usability issues:**

| # | Issue | Why it hurts engagement |
|---|--------|---------------------------|
| 1 | **No persistent way to reach Home** | Users must find a small Home icon; if missed, they feel stuck. |
| 2 | **Back vs Home is ambiguous** | ChevronLeft and Home both “escape” but do different things; wrong taps and frustration. |
| 3 | **No global navigation on mobile** | Primary navigation isn’t always visible or thumb-reachable. |
| 4 | **Weak “you are here”** | No breadcrumb or persistent section label; users lose context in long flows. |
| 5 | **Primary and secondary actions look similar** | Users hesitate on what to do next. |
| 6 | **Empty/error states not specified** | Users don’t know whether to change filters, retry, or go Home. |
| 7 | **Interview flow has no single progress** | Hard to estimate time and commitment. |
| 8 | **Topic selection feels like a gate** | No quick path (e.g. “Start with recommended”) for return users. |
| 9 | **Inconsistent chrome across sections** | Flashcards, Quiz, Interview have different headers; product feels fragmented. |
| 10 | **No clear “session end” next step** | After results or completion, next step isn’t the obvious CTA. |

---

## 2) New Information Architecture

**Sitemap:**
- **Tier 1:** Home (hub: Flashcards | Interview Practice | Quiz)
- **Tier 2:** Section roots — Flashcards (→ topic selection → Study); Interview (→ setup → Intro → Interview → Complete); Quiz (→ topic selection → Quiz run → Results)
- **Tier 3:** Settings/Profile (optional); Progress/Results (per section)

**Global navigation:**
- **Desktop:** Sticky top bar: Logo (left, links to Home) | Section or “Home” | Settings (right). Section entry from Home or top bar; “Home” always in bar.
- **Mobile:** Fixed bottom nav: Home | Flashcards | Interview | Quiz (or 3 + Settings). Top bar: Logo (tap = Home), current step label, optional in-flow Back. One tap on “Home” (top or bottom) = Home.

**Rule:** Every screen has at least one explicit way to reach Home (top or bottom “Home”) and a clear rule for “Back” (within-flow only).

---

## 3) Home Navigation Fix

**Requirement:** From every screen, return to Home in one tap.

**Desktop:**
- **Top bar:** Logo + “Home” (or logo-only, whole area = Home). Always visible.
- **Back:** In content only; goes to previous step in current flow. If no previous step, Back can go to Home or be hidden.

**Mobile:**
- **Bottom nav:** First item = **Home** (icon + label). Always visible and thumb-friendly.
- **Top bar:** Logo tap = Home. Optional “Back” for in-flow only.

**Breadcrumb (desktop):**  
`Home > Interview Practice > Question 3 of 10` — segments tappable; “Home” = Home.

**Mobile:** Prefer step indicator (e.g. “3 / 10”) over full breadcrumb. Home via bottom nav.

**Empty/error:**
- Empty: “No terms match.” Primary: “Change topics.” Secondary: Home (global nav).
- Error: “Something went wrong.” Primary: “Try again.” Secondary: Home (global nav).

**Navigation rules:**
1. Home control is always present and always goes to Home.
2. Back only moves within the current section.
3. Section entry from Home or global nav.
4. Empty/error screens always offer an action and access to Home.
5. Completion/results screens have explicit “Home” and “Try again” (or “Next section”).

---

## 4) High-Fidelity UI Direction (Logo-Aligned)

**Logo as source of truth:** The brand uses geometric facets, blues (#4474B9, #4E8ACE, #75C4F3, #0F6199), and one white element. Shape language: angular, precise, modern.

---

### Direction A — Premium modern

- **Colors (logo-derived):**
  - Primary: `#4474B9` — primary CTAs, key labels, active nav.
  - Primary hover: `#0F6199` (or 10–15% darker).
  - Secondary: `#4E8ACE` — secondary buttons, borders, backgrounds.
  - Accent: `#75C4F3` — sparse (success, “now playing”).
  - Neutrals: Background `#F2F7FC`; borders `#E5E7EB`; body `#1A1A1A`; secondary text `#6B7280`.
- **Typography:** Strong sans for headings (600–700); 24px section, 18px screen title, 14px subsection. Body 16px, 1.5 line-height, max ~65ch.
- **Spacing:** 4px base; 4, 8, 12, 16, 24, 32, 48, 64. Section padding 24px (mobile 16px).
- **Cards:** White/near-white, subtle border or shadow, radius 12–16px (align to logo softness). One primary CTA per card.
- **Accessibility:** Text on primary = white or light; contrast ≥4.5:1 (WCAG AA).

---

### Direction B — Clean minimal

- **Colors (lighter hand):**
  - Primary: `#4474B9` — links, primary CTAs, active state.
  - Secondary: `#4E8ACE` — borders, dividers, subtle fills.
  - Light: `#75C4F3` — backgrounds for selected/active.
  - Neutrals: More white (`#FFFFFF`), light gray bg (`#F9FAFB`), gray text (`#374151`).
- **Typography:** Same scale; slightly lighter weights (500–600 headings). More whitespace.
- **Spacing:** Same scale; more padding (e.g. 32px sections).
- **Cards:** White, light border, 12px radius; minimal shadow.
- **Accessibility:** Same WCAG AA; ensure gray text passes on white/light bg.

---

## 5) Key Screen Wireframes (Textual)

**Home**
- [Top bar] Logo (Home) | “Home” | (Settings)
- [Hero] Short title: “Azure Data Engineering”
- [Subtitle] One line value prop
- [Cards] 3 equal cards in a row (md+) / stack (sm): Flashcards | Interview Practice | Quiz. Each: icon, title, one-line description, tap = section entry.
- [Footer] Optional “Settings” or “Progress” link

**Flashcards list / decks**
- [Top bar] Logo (Home) | “Flashcards” | (Settings)
- [Breadcrumb] Home > Flashcards
- [Step] “Choose topics” — topic pills (multi-select); optional level filter.
- [Step] “Choose level” (optional) — All / Beginner / … / Advanced
- [CTA] “Start” (primary, full-width on mobile)
- [Empty] “No terms match” — “Change topics” + Home in nav

**Study mode**
- [Top bar] Logo (Home) | “Flashcards” or “Study” | Back (to topic selection)
- [Progress] “Card 5 of 24” or mini progress bar
- [Card] Large flip card: term (front) / definition (front). Flip = tap or button.
- [Actions] “Play” (TTS), “Next” / “Prev” (or swipe). Next = primary.
- [Bottom nav on mobile] Home | Flashcards | Interview | Quiz

**Results / progress**
- [Top bar] Logo (Home) | “Results” or “Quiz”
- [Summary] Score (e.g. “8/10”), short message
- [Detail] List of Q&A or “Review” expandable
- [CTAs] “Home” (primary), “Try again” (secondary)
- [Bottom nav on mobile] Home visible

**Settings / profile**
- [Top bar] Logo (Home) | “Settings”
- [Sections] Name (for greeting); Audio on/off; Theme (if any); About
- [CTAs] Save (if needed); “Home” in nav

---

## 6) UX Micro-interactions

**States (per component):**
- **Default:** Rest state; clear border/fill from design system.
- **Hover (desktop):** Slight darken or scale (e.g. 1.02); transition 150–200ms.
- **Focus:** Visible focus ring (2px offset, primary or neutral); never remove focus outline.
- **Pressed/Active:** Scale 0.98 or darker fill; 100ms.
- **Disabled:** Reduced opacity (e.g. 0.5); no pointer events; cursor not-allowed.
- **Loading:** Spinner or skeleton; button shows “Loading…” or spinner, disabled.

**Transitions:**
- **Principle:** Subtle, fast, purposeful. Prefer 150–250ms for UI (buttons, hovers); 250–400ms for layout (modals, panels).
- **Easing:** ease-out for enter; ease-in for exit. Or ease-in-out for small feedback.
- **Avoid:** Long or decorative motion that blocks use.

**Page/flow:**
- Section change: Optional short fade (150ms) or no transition.
- Card flip: 300ms transform (rotateY or similar).
- Modal/sheet: Slide up or fade 250ms.

---

## 7) Implementation Checklist

**P0 (Must-have for launch)**
- [ ] Persistent global nav: desktop top bar with Logo + “Home” on every screen.
- [ ] Mobile bottom nav with Home + Flashcards + Interview + Quiz; Home always visible.
- [ ] Back behavior: in-flow only; never cross-section. Document rules in code/comments.
- [ ] Empty state: “No terms match” with “Change topics” and Home available.
- [ ] Error state: message + “Try again” + Home available.
- [ ] Apply logo color system (primary, primary-dark, accent, light, bg) across all screens.
- [ ] One clear primary CTA per screen (Start, Next, Finish, Home).

**P1 (Should-have)**
- [ ] Breadcrumb or step indicator on desktop (e.g. Home > Section > Step).
- [ ] Typography scale and spacing scale (4/8px) applied consistently.
- [ ] Card and button styles from design system (radius, shadow, states).
- [ ] Completion/results screens: explicit “Home” and “Try again” (or “Next section”).
- [ ] Focus styles for keyboard/screen reader (WCAG AA).
- [ ] Hover/pressed/disabled states for all interactive elements.

**P2 (Nice-to-have)**
- [ ] Settings/Profile screen (name, audio, theme).
- [ ] Short transitions (150–250ms) on buttons and key interactions.
- [ ] Optional “Start with recommended” on topic selection for return users.
- [ ] Progress/summary per section (e.g. last score, last interview done).

---

*End of redesign plan. Use this as the single source of truth for implementation; no code in this document.*
