# Gallant Funnel — UI/UX Improvement Loop

A repeatable, evidence-driven process for improving the conversion **and quality** of the
Anthony Gallant State Farm lead funnel (renters / homeowners / auto), grounded in current
CRO, accessibility, and multilingual-UX research. This file is the *process*; the live
work-list is **[UX-BACKLOG.md](./UX-BACKLOG.md)**.

Scope: `index.html` (renters), `homeowners.html`, `auto.html` — three near-identical static
pages that share the form and JS, so a verified win on the highest-traffic page ports to the
other two cheaply.

---

## North star & guardrails

**North star:** qualified-lead rate, segmented (never blended) by **product × language
(en/es/ht) × source (facebook / qr / canvassing)**. A submit the agent can't reach or close
is not a win — lead *quality* is the win condition, not raw volume.

**Three guardrails — never a test variant, never traded for a conversion bump:**
1. **Bot protection** — Cloudflare Turnstile token gate + honeypot stay on every submit.
2. **Consent** — every lead captures `consent_text` + server timestamp + IP/UA (TCPA); one
   clear, conspicuous consent line; no second mandatory checkbox.
3. **Honesty / brand** — price & savings claims stay substantiated by Anthony and carry the
   sample-rate disclaimer; urgency stays real (the 5-minute promise, office-hours swap); no
   unreviewed ES/HT consent line ships; State Farm logo/claims within agent-marketing rules.

If any guardrail would break, **stop the loop** and resolve it before shipping anything else.

---

## The rubric — scored every cycle

| Dimension | What "good" looks like | How we measure |
|---|---|---|
| **Message-match & scent** (ad → hero, per language) | Each hero echoes the ad's exact promise/number/language on first paint, no English flash. Homeowners/auto carry quantified hooks like renters' `$5.50/mo`. | `form_start` rate per `utm_campaign → page → language`; a creative trailing the page average flags a scent break. `documentElement.lang` matches the ad-set language. |
| **Form friction** (field count & flow) | 3 contiguous required fields (name, phone, email); language picker non-required and out of the required block; every optional field marked "(optional)"; a "why we need your phone" reassurance at the phone field. | `form_start` rate, start→submit rate, last-field-touched on abandon, time-to-complete, inline-error-then-abandon. Segment by product × language × device. |
| **Trust & social proof** | ≥1 honest, substantiated third-party proof near the CTA (real Google rating + count, "Licensed in NC", or first-name+neighborhood testimonial), mirrored into ES/HT with ≥1 in-language testimonial. No fabricated ratings (FTC). | Before/after `form_start` + submit-rate on the trust element (sequential, big-swing only); scroll-depth to it; downstream lead quality. Every claim traced to a real source in the PR. |
| **Accessibility (WCAG 2.2 AA)** | Visible ≥3:1 focus indicator on every control; all text ≥4.5:1; errors set `aria-invalid` + `aria-describedby` with a non-color cue; language toggle `aria-pressed` + ≥44px targets; focus not hidden by the sticky bar; reduced-motion honored. | axe/Lighthouse a11y ≥95, zero serious/critical, across 3 pages × 3 languages; keyboard-only completion with visible focus; VoiceOver/NVDA announce label/required/error; 100% contrast pass. |
| **Core Web Vitals & perceived perf** (mobile field data) | p75 mobile LCP ≤2.5s, INP ≤200ms, CLS ≤0.1. No CLS from the sticky CTA, Turnstile, lazy agent photo, or i18n hero reflow. Third-party tags deferred so they don't block INP at first field focus. | Vercel Speed Insights / web-vitals by device × language; lab check via the `web-perf` skill before merge. Watch CLS around `#sticky-cta` + `#turnstile-container`, INP on the phone-formatter keystroke handler. |
| **Trilingual parity & localization** | ES + HT consent, rate disclaimer, tracking notice, hero, CTA native-speaker reviewed (not draft) before scaling `_es/_ht` spend (HT prioritized). Language persists across the cross-sell hop. Native toggle labels (English / Español / Kreyòl). No string ships English-only. | Binary pre-launch gate: native sign-off recorded per language for consent + disclaimers. Per-language conversion/abandonment parity. Manual language-override rate as a detection-accuracy meter. |
| **Compliance & honesty integrity** | (See guardrails.) Single conspicuous consent line; claims substantiated + disclaimed; urgency honest; brand-compliant. | 100% of leads carry `consent_text` + timestamp + bot-pass (any drop = stop the loop); PR checklist confirms no unsubstantiated claim, no bot/consent field removed. |
| **Lead quality** (downstream north star) | Volume gains don't degrade reachability or close rate; qualifying fields retained; preferred contact language captured + honored; the 5-minute promise is operationally real. | Agent dashboard statuses: reachable-contact, contacted, quoted, bound, junk rate; cost per qualified lead by source × language. Raw submit-rate is a leading indicator only. |

---

## The cycle — bi-weekly

Cadence is **two weeks**, matched to this funnel's low traffic so the high-frequency proxy
(`form_start` rate) can accrue signal between cycles.

1. **Observe** — pull the cycle's data: Vercel Web Analytics (visitors) + Supabase `/api/lead`
   (submits; once instrumented: `form_start`, `last_field`, `ttc_ms`) → compute
   landed → started → submitted per product × language × source; pull Speed Insights CWV at
   p75 mobile; review Clarity abandoned-form recordings per language; collect Anthony's
   downstream lead-quality statuses.
2. **Diagnose** — score each rubric dimension; name the single biggest gap (low `form_start`
   ⇒ scent/hero; healthy `form_start` but low start→submit ⇒ form friction). Turn Clarity +
   agent-debrief observations into new backlog hypotheses.
3. **Prioritize** — re-rank the backlog by ICE (importance weighted by which product page has
   the most paid volume, since a win ports near-free to the other two). Pick **1–3 items**.
   Reserve a formal A/B test only for big structural bets (≥10–30% plausible lift); ship
   everything else as a monitored sequential before/after.
4. **Build** — feature branch off `main` (`git fetch origin main` first). Keep all-language
   copy edits together. Never touch bot/consent/data-contract code unless the item explicitly
   *extends* it additively.
5. **Self-verify** — run the gates locally (axe/Lighthouse, lab CWV via `web-perf`, keyboard +
   VoiceOver pass, a lead-payload smoke test confirming `consent_text` + timestamp +
   Turnstile/honeypot still captured, es/ht parity).
6. **Review & ship** — open a PR with the **principle → gap → change** rationale + the gate
   checklist; Nash reviews and merges (no auto-deploy). ES/HT or consent-wording PRs attach
   native-speaker + State Farm brand sign-off before merge.
7. **Measure & learn** — after merge, watch the proxy (`form_start`) + CWV for regressions
   within days; let submit-rate + lead quality accrue across the cycle; record the outcome
   (win / flat / loss / inconclusive) in [UX-BACKLOG.md](./UX-BACKLOG.md), noting confounds
   (ad-mix, seasonality) so the next cycle starts from evidence.

---

## Gates — must pass before merge

- **Data contract** — every lead still POSTs the full `/api/lead` JSON Supabase expects; new
  fields (`form_start`/`last_field`/`ttc_ms`) are *additive optional columns only*, no
  renamed/removed keys.
- **Bot protection** — Turnstile + honeypot intact on every submit.
- **Compliance** — 100% of leads capture `consent_text` + timestamp + IP/UA; single conspicuous
  consent line; claims substantiated + disclaimed; urgency honest; brand-compliant.
- **Accessibility** — Lighthouse/axe a11y ≥95, zero new serious/critical; visible focus on
  100% of controls; contrast 100%; no WCAG 2.2 AA regression (target size, focus-not-obscured,
  error semantics).
- **Core Web Vitals** — p75 mobile LCP ≤2.5s, INP ≤200ms, CLS ≤0.1, not regressed vs the prior
  cycle (lab before merge, field confirm after).
- **i18n parity** — no string ships English-only; ES/HT consent + disclaimer changes carry
  native-speaker sign-off; language persists across the cross-sell hop.

---

## Deployment posture

Branch + PR only, **no auto-deploy**. Repo lives on the **nash-davis** (Nash's projects, Pro)
Vercel team. Each cycle's changes land on a feature branch off `main` (`git fetch origin main`
first), open a PR with the principle→gap→change rationale + gate checklist, and wait for Nash's
merge. ES/HT and consent-wording PRs additionally require native-speaker + State Farm
brand/compliance sign-off attached before merge. Because the three pages share form/JS, a
verified win on the highest-traffic product page is ported to the other two in the same or next
PR. Commits omit the Claude `Co-Authored-By` trailer (fleet convention).

---

## Measurement

- **Primary north star:** lead-submit rate = submits / unique visitors, segmented by product ×
  language × source — never blended.
- **High-frequency proxy (low traffic):** `form_start` rate (first-field focus / visitors) and
  start→submit rate — accrues far faster than final submits, so the loop learns within a cycle.
- **Per-field drop / last-field-touched + time-to-complete** — pinpoints which field to fix.
- **Downstream lead quality (true north):** reachable-contact, contacted, quoted, bound, junk
  from Anthony's dashboard statuses; cost per qualified lead by source × language.
- **CWV field data at p75 mobile** (LCP/INP/CLS) — a standing guardrail every cycle.
- **Qualitative:** Microsoft Clarity rage/dead-click %, scroll-depth to form, abandoned-form
  sessions reviewed per language.
- **Experiment health (for any A/B):** conversions-per-variant vs a pre-registered minimum
  sample, days-to-decision, adherence to a pre-set sequential stopping rule (no peeking).

> **Low-traffic rule:** do **not** micro-A/B test (button color, microcopy) — you'll never
> reach significance. Reserve formal tests for structural bets (drop the required language
> field, quantified hero, single- vs two-step), run as sequential tests with efficacy/futility
> boundaries set *before* launch, and lean on `form_start` + Clarity + agent debriefs for
> everything else. Treat before/after as confounded by ad-mix and seasonality, and say so.

---

## Running a cycle (quickstart)

1. Read this file's rubric + gates, then **[UX-BACKLOG.md](./UX-BACKLOG.md)**.
2. Pull the cycle's data (Observe) and score the rubric (Diagnose).
3. Pick the top 1–3 backlog items, branch, build, self-verify against the gates.
4. Open the PR with the principle→gap→change rationale + the gate checklist.
5. After merge, record the outcome in UX-BACKLOG.md and re-rank.

**Automation (optional, not yet wired):** a daily *propose-only* heartbeat (mirroring the
existing `tsd-loop-daily` pattern) can scan analytics + Clarity and append hypotheses to the
backlog without shipping. Only the bi-weekly cycle ships. Ask Nash before scheduling it.
