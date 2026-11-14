# Alaga — Design & Art Direction System

## Phase 0: Brief
- **Subject:** Alaga, an online counseling and mental healthcare booking platform tailored for the Philippines.
- **Audience:** Adults, students, and working professionals in the Philippines seeking confidential, PRC-licensed counseling without clinical coldness or overwhelming directories.
- **Job:** Orient the visitor in under 3 seconds, establish human warmth and clinical trust, and guide them to browse PRC-licensed counselors (`/counselors`) or sign in to book a 1-on-1 session.
- **Constraints:** Existing Next.js 16 (App Router, TypeScript, Tailwind CSS v4) application (`frontend-landing`). Must preserve `CrisisBanner` (with live `/admin/content` fetch and `tel:1553`), `AuthContext`, `ToastContext`, live `/counselors/` and `/admin/content` fetches, and all existing routes.

---

## Phase 1: Concept

### Three Concepts Explored
1. **The Quiet Room (*Pag-aalaga* — Name/Etymology):** *Alaga* means tending with care. The site is a quiet, sunlit room with a single breathing light field that responds to your presence, where counselors are introduced like real people across a table rather than cards in a SaaS directory.
   - Scores: Originality 4, Fit 5, Feasibility 5, Portability 2.
2. **The Intake Notebook (Process Metaphor):** Structured like a linen-bound clinical notebook with ruled margins and handwritten annotations.
   - Scores: Originality 4, Fit 4, Feasibility 4, Portability 3.
3. **Manila Time / Hours of Quiet (Place & Culture):** Anchored to a live Manila Time (UTC+8) dial mapping open session hours across the day.
   - Scores: Originality 4, Fit 4, Feasibility 3, Portability 2.

**Selected:** Concept 1 (*The Quiet Room / Pag-aalaga*), borrowing the live Manila Time (UTC+8) indicator from Concept 3 for the architectural corner frame and footer colophon.

### Concept Card
- **Idea:** *Alaga* means tending with care: the site is a quiet, sunlit room where a soft breathing light responds to your scroll and counselors are introduced by name and voice rather than stacked in generic SaaS cards.
- **Metaphor:** A quiet consultation room in Manila—capiz-filtered daylight, molave wood/ink, pandan leaf, and unhurried conversation.
- **Signature:** **The Quiet Room Field + Interactive Counselor Index** — a single scroll-and-pointer-driven ambient light/horizon field (with subtle idle breathing) paired with a tactile full-width counselor index where hovering or focusing a practitioner's row reveals their clinical portrait, focus areas, and session details in a poised preview frame (inline on mobile).
- **Emotion:** Calm, grounded, human—like stepping out of noisy traffic into a quiet room where someone is ready to listen.
- **Motion verb:** *Breathe and settle* (`expo.out` 0.9–1.2s entrances, `power3.out` 0.35s hovers, gentle continuous idle breath on the single GSAP ticker).
- **Screenshot:** The asymmetric hero composition with large `Zodiak` + `Host Grotesk` display typography, architectural hairline framing, live Manila Time (UTC+8) stamp, and zero gradient blobs or SaaS pill clutter.

---

## Phase 2: Art Direction System

### Palette (Capiz, Molave Ink & Pandan)
- `ground`: `#F3F1EC` (soft capiz limestone off-white)
- `surface`: `#EAE7E0` (recessed warm stone)
- `elevated`: `#FFFFFF` (crisp paper for interactive frames)
- `ink`: `#111A22` (deep molave slate — 15.8:1 on ground)
- `muted`: `#4E5962` (secondary ink — 6.4:1 on ground, WCAG AA+)
- `line`: `rgba(17, 26, 34, 0.14)` (hairline architectural rules)
- `accent`: `#175946` (deep botanical pandan/eucalyptus — 7.6:1 on ground)
- `curtain`: `#111A22` (ink curtain for route transitions)

### Typography
- **Display & Reflections:** `Zodiak` (Fontshare) — sharp contemporary serif with expressive, humane italics (`font-serif`).
- **UI, Structure & Body:** `Host Grotesk` (Google Fonts) — clean, slightly humanist neo-grotesk (`font-sans`).
- **Fluid Scale:**
  - `--t-mega`: `clamp(3.25rem, 1.5rem + 7.2vw, 7.25rem)` (leading `0.94`, tracking `-0.035em`)
  - `--t-xl`: `clamp(2.25rem, 1.4rem + 3.2vw, 4rem)` (leading `1.02`, tracking `-0.025em`)
  - `--t-l`: `clamp(1.625rem, 1.25rem + 1.4vw, 2.375rem)` (leading `1.15`, tracking `-0.02em`)
  - `--t-m`: `clamp(1.1875rem, 1.05rem + 0.5vw, 1.4375rem)` (leading `1.35`)
  - `--t-body`: `clamp(1rem, 0.96rem + 0.18vw, 1.125rem)` (leading `1.55`, measure `58ch`)
  - `--t-s`: `0.875rem`, `--t-xs`: `0.75rem`

### Grid & Rhythm
- 12-column architectural grid on desktop (`max-width: 1280px`, fluid gutter `clamp(16px, 2.5vw, 32px)`), 4 columns on mobile (390px).
- Vertical rhythm alternates across 4 deliberate moods:
  1. **Hero (Airy / Architectural):** `min-height: calc(100svh - 110px)` asymmetric split (cols 1–8 display statement + primary CTA, cols 9–12 quiet room coordinates, Manila time & trust anchors).
  2. **Reflections Band (Full-bleed Ink/Stone Chapter):** Single-column editorial pull-quote with interactive prev/next index and subtle breathing progress bar.
  3. **Counselor Index (Interactive Index List):** Full-width hairline rows (`Name` · `Credential` · `Focus` · `Action`) with floating/pinned preview portrait on desktop, inline portrait cards on mobile.
  4. **How Care Unfolds (Asymmetric Ledger):** Left sticky chapter summary (cols 1–4) + right 3-part numbered sequence (cols 6–12) separated by hairline rules, not identical rounded cards.
  5. **About / Sanctuary Manifesto (Split Frame):** Narrative manifesto + 2x2 architectural spec table with crisp hairlines.
  6. **Footer (Finale):** Giant `Alaga` wordmark, Manila Time (UTC+8) + 24/7 Crisis Hotline `1553`, Explore & Legal columns, colophon.

### Shape & Motion Language
- **Radius rule:** Sharp architectural `2px`–`4px` for structural frames and hairlines; `9999px` pill reserved strictly for primary action buttons and status tags.
- **Micro-interactions (one treatment per role):**
  - **Primary CTA buttons:** Pointer-entry circular fill flood (`data-fill`, ink/accent flood) + nudging arrow.
  - **Nav links:** Sliding underline draw (`1px` hairline) + active state indicator.
  - **Counselor index rows:** Row hairline highlight + arrow travel + preview frame cross-reveal.
  - **Utility/footer links:** Color shift + subtle underline.
- **Idle state:** The Quiet Room canvas renders a subtle, slow-breathing organic horizon/light field driven on GSAP's ticker (paused off-screen and disabled under `prefers-reduced-motion`).

### Genericness Test
- Removed: centered hero over two blurred gradient blobs (`blur-3xl`).
- Removed: eyebrow pill above hero headline.
- Removed: 3 identical rounded SaaS feature cards & 3 identical counselor cards.
- Removed: italicizing one word of a generic centered headline as the only typographic idea.
- Replaced with: asymmetric 12-column editorial layout, `Zodiak` + `Host Grotesk` pairing, interactive counselor index list, single-clock GSAP/Lenis motion engine, and continuous ink-curtain page transitions.
