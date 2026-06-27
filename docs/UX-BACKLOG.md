# Gallant Funnel — UX Backlog (living board)

The prioritized work-list the [UX-LOOP.md](./UX-LOOP.md) cycles through. Ranked by **impact ↓,
risk ↑, effort ↑**. Each item maps a research-grounded principle → a current gap → a concrete
change, and carries how we'll know it worked.

**Status values:** `Proposed` · `Next` (picked for the upcoming cycle) · `Building` · `Shipped`
(merged) · `Measuring` · `Won` / `Flat` / `Lost` (outcome recorded). Update the status + add an
**Outcome** line when a cycle closes. New hypotheses (from Clarity, agent debriefs, analytics)
get appended as `Proposed` and re-ranked next cycle.

> **Suggested Cycle 1** (all `Proposed`): **#12 instrumentation first** (the loop is blind to
> *where* people drop without it), then the quick high-impact / low-risk wins **#1, #2, #4**
> (one PR), which ship live on merge with no external dependency. **#3** (native ES/HT review)
> should start in parallel since it gates scaling `_es/_ht` ad spend.

| # | Item | Dimension | Impact | Effort | Risk | Status |
|---|---|---|---|---|---|---|
| 1 | Language picker → non-required | Form friction | High | S | Low | Proposed |
| 2 | Restore visible WCAG-AA focus indicator | Accessibility | High | S | Low | Proposed |
| 3 | Native-speaker review of ES/HT consent + disclaimers | i18n parity | High | M | Low | Proposed |
| 4 | Fix failing text-contrast tokens | Accessibility | High | S | Low | Proposed |
| 5 | Honest social-proof line near the CTA | Trust & social proof | High | M | Low | Proposed |
| 6 | Per-field `aria-invalid`/`describedby` + non-color error cue | Accessibility | High | M | Low | Proposed |
| 7 | Quantified hero hooks for homeowners + auto | Message-match | High | M | Med | Proposed |
| 8 | Pre-submit "real person / why we need your phone" line | Trust & social proof | High | M | Low | Proposed |
| 9 | Defer third-party tags + reserve Turnstile height | Core Web Vitals | Med | M | Med | Proposed |
| 10 | Persist language across the cross-sell hop | i18n parity | Med | S | Low | Proposed |
| 11 | Kill the first-paint English flash for ES/HT | i18n parity | Med | M | Med | Proposed |
| 12 | Instrument the form middle (`form_start`/`last_field`/`ttc`) | Form friction | High | M | Low | Proposed |
| 13 | Microsoft Clarity replay + heatmaps (consent-gated, masked) | Form friction | Med | S | Low | Proposed |
| 14 | Language toggle → native names, ≥44px, `aria-pressed` | Accessibility | Med | S | Low | Proposed |
| 15 | Honor `prefers-reduced-motion` (spinner, smooth-scroll) | Core Web Vitals | Low | S | Low | Proposed |
| 16 | `scroll-padding` so focus isn't hidden by sticky CTA | Accessibility | Low | S | Low | Proposed |
| 17 | Port "what's covered" / benefit block to homeowners + auto | Trust & social proof | Med | M | Low | Proposed |
| 18 | Move cross-sell into the success state | Form friction | Low | M | Low | Proposed |

---

### 1. Make the "Language you speak" select non-required (all 3 pages)
- **Why:** each required field measurably lowers completion (HubSpot ~4.1%/field; 4→3 fields
  ~+50% in cited cases). The picker is auto-populated by `applyLang()` and redundant with the
  active UI language already in the payload, so it's a 4th mandatory step with near-zero
  marginal data value.
- **Change:** remove `required` from `<select id="language">` (index.html:110, homeowners.html:109,
  auto.html:109). Keep the field, auto-default, and submitted value so the agent still gets
  preferred-contact language. No `/api/lead` change. Optionally relabel to "Preferred contact
  language" (needs es+ht).
- **Measure:** start→submit rate and last-field-touched on the select, before vs after;
  preferred-language still populated (quality unchanged).

### 2. Restore a visible WCAG-AA focus indicator on every interactive element
- **Why:** inputs use `focus:outline-none` with only a `ring-sf-red/20` (~1.36:1) replacement
  (fails WCAG 2.4.7); language buttons, submit, and sticky CTA have no ring at all. Cited ~12%
  form-completion recovery from restoring a suppressed focus ring; keyboard users abandon ~3×
  more with invisible focus.
- **Change:** in `tools/tw-input.css`, swap `focus:outline-none` + `ring-sf-red/20` for
  `focus-visible:ring-2 ring-sf-red` (full opacity) + 2px offset on inputs/select/checkbox/
  language buttons/submit/`#sticky-cta`; regenerate via `bash tools/build-css.sh`. No HTML change.
- **Measure:** Lighthouse a11y ≥95, zero focus-visible serious issues; keyboard tab-through
  shows focus on 100% of controls.

### 3. Native-speaker review of ES + HT consent, rate disclaimer, tracking notice
- **Why:** the ES/HT dictionaries are flagged `DRAFT` in-code (index.html:243,303); FTC 16 CFR
  14.9 requires disclosures in the ad's language, and a mistranslated TCPA consent line is both
  a conversion drag and legal exposure on a State Farm brand. HT carries the highest
  machine-translation risk and least in-house QA.
- **Change:** send the ES + HT `consent`, `rate_disclaimer`, `tracking_notice`, `hero`, and
  `btn_submit` strings (all three I18N objects) to native ES + native HT reviewers; replace and
  delete the DRAFT comments. Prioritize HT. Until HT is reviewed, gate the HT toggle to explicit
  `?lang=ht` / `_ht` traffic. Pure copy (es+ht).
- **Measure:** binary pre-launch gate — native sign-off recorded per language; per-language
  abandonment parity on consent/phone fields.
- **Depends on:** Nash sourcing native reviewers.

### 4. Fix failing text-contrast tokens
- **Why:** computed ratios fail WCAG 1.4.3 AA — ink/55=4.17, ink/50=3.54, ink/45=3.03, gray-400
  placeholder=2.54, red-on-cream=4.44. The consent + rate disclaimer are the legally important
  lines and are currently the faintest text on the page.
- **Change:** bump rate disclaimer (index.html:85), consent (160), footer (234),
  homeowners/auto hints (ink/50), and the inactive toggle (`applyLang` setBtn ink/45) to ≥ink/70;
  set placeholder to a ≥4.5:1 token; use `sf-redDark` (#B81E1B) for red text/bullets over cream.
  Regenerate tw.css. No data change.
- **Measure:** contrast pass 100% via axe; manual mobile legibility check of consent/disclaimer.

### 5. Add an honest social-proof line near the CTA (all 3 pages)
- **Why:** cold paid insurance traffic needs third-party proof; reviews are the strongest local
  trust lever (97% read them; 68% require 4★+) and the funnel has **zero**. Documented 19–64%
  lifts from a real rating/testimonial. Must be real (FTC) — no fabricated 5.0.
- **Change:** replace the near-CTA trust bar (index.html:164–166 + equivalents) with Anthony's
  **real** Google rating + count (e.g. "4.9 · 60+ Gaston County reviews") or, if count is low, a
  first-name + neighborhood testimonial. Add i18n keys with ≥1 ES testimonial (es+ht). Source
  from real GBP/clients only.
- **Measure:** form_start + submit-rate before/after (sequential, big-swing); scroll-depth to
  the proof; downstream lead quality stable or up.
- **Depends on:** Anthony's real rating/count or a real client testimonial.

### 6. Per-field `aria-invalid` + `aria-describedby` errors with a non-color cue
- **Why:** `flagField()` (index.html:545) signals errors by red color only, never sets
  `aria-invalid` or links the message (fails WCAG 3.3.1/1.4.1); screen-reader users on
  phone/email aren't told it's invalid. Field-level errors also cut abandonment vs one pooled chip.
- **Change:** in `flagField()` set `aria-invalid="true"` + `aria-describedby` to a per-field
  `<p id="{field}-err">`, render the existing specific message there, add a non-color cue (icon
  or bold left border), clear on the existing `once:input` listener. Add `aria-required` to
  name/phone/email. Keep the `role=alert` summary chip. No `/api/lead` change.
- **Measure:** VoiceOver/NVDA announce invalid+reason; per-field error-then-abandon on
  phone/email drops; Lighthouse a11y.

### 7. Quantified hero hooks for homeowners + auto (with the sample-rate disclaimer)
- **Why:** renters leads with a concrete `$5.50/mo` anchor; homeowners ("Your biggest
  investment, protected.") and auto ("Same car. Better rate?") give cold visitors no number. A
  specific number in the H1 is the highest-leverage copy change for the two weaker pages — but
  must be substantiated + disclaimed to stay honest.
- **Change:** add a quantified, Anthony-substantiated hook to homeowners.html:78–81 and
  auto.html:78–81 (e.g. auto "Drivers who switch save an avg of $X") paired with the
  renters-style disclaimer (clone index.html:85). If no figure is substantiated, soften to "See
  if you're overpaying". Copy in all 3 languages (es+ht).
- **Measure:** submit-rate on homeowners/auto vs baseline; bounce/form_start by ad creative;
  honesty gate (figure substantiated).
- **Depends on:** a substantiated figure from Anthony (else ship the softened version).

### 8. Surface the response-time + human promise and a "why we need your phone" line at the form
- **Why:** the strongest asset (a real person texts back in ~5 min) only appears *post*-submit,
  too late to influence the decision; the phone ask is the top cold-traffic drop point.
  Pre-submit reassurance + a point-of-entry phone rationale both lift completion.
- **Change:** add a pre-CTA line ("A real person — Anthony — texts you back, usually within
  5 min, Mon–Fri", reusing the `officeOpenNow` honest swap) + a hint under the phone field ("We
  only use this to text your quote — no robocalls"), mirroring the email/address hint style.
  De-dup the triple "No spam" microcopy at the same time. Copy (es+ht).
- **Measure:** phone-field abandonment; form_start→submit (bundle for an A/B, else sequential).

### 9. Defer third-party tags to idle/first-interaction; reserve Turnstile height
- **Why:** Meta Pixel + gtag + Turnstile inject near load and compete for the main thread right
  as the user reaches the first field, hurting INP; Turnstile's `empty:hidden` container can pop
  in and cause CLS. Conversion events only fire on submit, so tags can load late.
- **Change:** load Meta/GA tags on first form interaction or `requestIdleCallback` (after the
  `/api/config` consent resolve); render Turnstile lazily on form focus; reserve a fixed
  min-height on `#turnstile-container`. Do **not** remove Turnstile or change the consented
  config flow.
- **Measure:** INP + CLS at p75 mobile before/after; confirm Lead/conversion events still fire
  on submit.

### 10. Persist language across the renters/homeowners/auto cross-sell hop
- **Why:** `applyLang()` never writes the choice back, so an ES/HT visitor who taps the
  cross-sell link (index.html:231) lands in auto-detected (likely English), silently dropping
  the bilingual audience the funnel targets.
- **Change:** in `applyLang()` persist the active lang to `localStorage` and append `?lang=` to
  internal cross-sell links; have `detectLang()` read `localStorage` above `navigator.language`.
  JS-only, no copy/contract change.
- **Measure:** manual language-override rate; per-language session continuity across pages;
  ES/HT conversion parity.

### 11. Eliminate the first-paint English flash for ES/HT visitors
- **Why:** language is swapped on `DOMContentLoaded`, so ES/HT visitors see the English
  hero/subhead/consent flip after paint, and the longer translated strings reflow the
  text-balance/`<br>` hero — a CLS + scent break in the most prominent above-the-fold block, for
  exactly the audience the funnel is built to win.
- **Change:** move `detectLang()` into a tiny inline `<head>` script that sets
  `documentElement.lang` + a lang class before body paint; reserve hero min-height and avoid
  `<br>`-driven reflow so longer ES/HT strings don't shift the fold. No contract/copy change.
- **Measure:** CLS at p75 mobile; visual check of no English FOUC on throttled mobile; ES/HT
  bounce/scroll-depth.

### 12. Instrument the form funnel middle (`form_start`, `last_field`, `time-to-complete`)
- **Why:** today only success events fire, so the loop is blind to **where** people drop. A
  high-frequency `form_start` proxy is essential to learn anything at this traffic level, and the
  per-field drop table makes every other item measurable. **Foundational — do this first.**
- **Change:** add a one-time `form_start` (first `focusin` on `#lead-form`) to `dataLayer` + fbq
  `InitiateCheckout` (NO PII); capture `last_field` on blur and `ttc_ms` at submit, append both
  to the `/api/lead` JSON. Confirm Supabase accepts the two new **additive optional** columns
  (contract extended, not broken).
- **Measure:** landed→started→submitted funnel per product×language; per-field abandon table
  populated; no PII in analytics events.

### 13. Microsoft Clarity session replay + heatmaps (consent-gated, input-masked)
- **Why:** at low traffic, qualitative "why" beats slow A/B "what". Clarity is free/unlimited and
  surfaces rage-clicks, dead-clicks, and abandoned-form sessions per language — the fastest way
  to find real breakage (e.g. the phone formatter fighting autofill, language-select confusion).
- **Change:** inject Clarity async into the shared `<head>` behind the same `/api/config` consent
  pattern as Meta/GA (so `tracking_notice` stays truthful); ensure default input masking so no
  phone/email/PII is recorded. No `/api/lead`, bot, or consent-capture change.
- **Measure:** # abandoned-form sessions reviewed per language; rage/dead-click %; scroll-depth —
  feeds the hypothesis backlog.

### 14. Enlarge the language toggle to ≥44px native-name targets with `aria-pressed`
- **Why:** the EN/ES/HT toggle is ~12px text with `-my-1` shrinking targets below WCAG 2.5.8
  (24px min); state is color-only (no `aria-pressed`); codes are harder than native names for
  low-English-proficiency visitors (USWDS guidance). It's the key control for the trilingual
  audience.
- **Change:** relabel to native names "English · Español · Kreyòl" (index.html:61–67); bump
  padding/min-h to a 44px tap area, remove `-my-1`; add `aria-pressed` + a non-color active cue
  (underline/bold). aria-labels are already localized. No contract change.
- **Measure:** tap-target audit 100%; VoiceOver announces current language; mobile mis-tap rate.

### 15. Honor `prefers-reduced-motion` (submit spinner + smooth-scroll)
- **Why:** the submit spinner uses infinite `animate-spin` and `showError`/`showSuccess` use
  smooth `scrollIntoView`; continuous motion at a conversion-critical moment can trigger
  vestibular discomfort. Cheap, zero-risk inclusivity + trust win.
- **Change:** add `@media (prefers-reduced-motion: reduce)` in `tw-input.css` to disable
  `animate-spin` (static "Sending…" label) and set `scroll-behavior:auto`; pass
  `{behavior:'auto'}` to `scrollIntoView` when reduced motion is requested. Regenerate tw.css.
- **Measure:** manual check with OS reduced-motion on; no regression to submit acknowledgment.

### 16. Add `scroll-padding` so focused controls aren't hidden behind the sticky CTA
- **Why:** the fixed-bottom `#sticky-cta` can fully obscure a tabbed-to control on short mobile
  viewports (fails WCAG 2.4.11, new in 2.2). Low-effort fix.
- **Change:** add `scroll-padding-bottom` (or `scroll-margin` on near-fold focusables) equal to
  the sticky bar height; the `.hidden` class already removes it from tab order when hidden —
  verify that holds. No contract change.
- **Measure:** tab down a 360×640 viewport — no focused control fully covered by the bar.

### 17. Port the "what's covered" / benefit block to homeowners + auto
- **Why:** renters' concrete covered-items list is exactly the relatable framing that converts;
  homeowners + auto have no equivalent, making them thinner. Concrete coverage proof reduces
  cold-traffic hesitation.
- **Change:** clone the renters benefit pillars + "what's covered" list (index.html:187–212) into
  homeowners + auto with line-appropriate items (home: dwelling/liability/loss-of-use; auto:
  liability/collision/roadside). Copy in all 3 languages (es+ht). No contract change.
- **Measure:** scroll-depth + submit-rate on homeowners/auto vs baseline.

### 18. Move the cross-sell into the success state instead of in-funnel
- **Why:** the bottom-of-page cross-sell is a competing exit on a single-goal paid landing page;
  surfacing it only after the lead is captured turns a leak into a second conversion.
- **Change:** relocate the cross-sell (index.html:229–232, auto.html:226–229, homeowners
  equivalent) into the post-submit success block, framed as a bundle value-add. Keep language
  persistence (#10) on the link. Copy (es+ht). No contract change.
- **Measure:** primary submit-rate (should not drop) + success-state cross-sell click-through as
  a new secondary conversion.
