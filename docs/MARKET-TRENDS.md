# Market Trends — Gallant Funnel (2026-06 research iteration)

Web-grounded research across 8 lenses (renters / home / auto market dynamics, digital
lead-gen + paid-social, the multicultural/in-language market, TCPA-FTC-state regulatory
shifts, AI-era consumer shopping, and local-agent marketing) → 70 cited trends synthesized
into the priorities below. Feeds [UX-BACKLOG.md](./UX-BACKLOG.md). Sources cited inline are
2024–2026 (Insurance Information Institute / Triple-I, NAIC, J.D. Power, LexisNexis, eMarketer,
Consumer Federation of America, Pew/Census, FCC/FTC, NC DOI, CRO vendors).

## The read

The wind is at this funnel's back. Shopping and switching are at record highs across all three
lines, **renters is the only P&C line still gaining penetration (~60% in 2025)**, and ~57% of
auto customers shopped last year (a 19-year high) — so the funnel is **harvesting warm intent,
not creating it cold**. The biggest wins are **downstream of the form and invisible to the
visitor**: an instant in-language auto-reply text (speed-to-lead is the whole game when a lead
is price-shopped against 3–8 competitors at once), server-side CAPI quality, and sending
quoted/bound events back to Meta so it targets *buyers* not *form-fillers*. The single most
underpriced asset is the **trilingual build** — a large, growing, under-penetrated Hispanic
market the direct carriers serve English-only — but it only pays off if the ES/HT pages are
**transcreated (not translated)**, carry **in-language consent/disclosures**, and route to
language-capable follow-up. The clearest hardening priority is **compliance** (named-seller
TCPA consent, NC G.S. 58-63-15 truth-in-advertising, State Farm brand sign-off) — all of which
rest personally on Anthony's license. Differentiate on the one axis directs and embedded
carriers can't copy: **a real named local agent who bundles and handles claims**, while keeping
the "$5.50/month, covered in 5 minutes" hook to neutralize the price/speed objection.

## Top trends

| # | Trend | Evidence (2024–26) | Implication for the funnel | Horizon |
|---|---|---|---|---|
| 1 | **Speed-to-lead is decisive** — leads are price-shopped against 3–8 carriers; first responder wins | ~78% buy from first contact; 5-min ≈ 8–21× connect/qualify vs 30 min; SMS ~90%+ open (Kixie/Verse/Apten) | The gap is the round-trip back to the **lead**, not the alert to the agent → instant in-language auto-reply text on submit | now |
| 2 | **Server-side CAPI is the recovered baseline + the pixel-litigation fix** | Pixel-only loses 61–72% mobile signal; CAPI recovers 20–30%; CIPA filings 54→675 (’22→’24), $5k/violation | Already have CAPI (PR #8); ensure high Event Match Quality + no pre-consent PII in the pixel (Consent Mode v2) | now |
| 3 | **Conversion-Leads optimization is the top lead-quality lever** | Sending quoted/bound back via CAPI = 30–50% quality lift for 10–20% CPL (Wevion/AdAmigo) | Wire downstream outcome events keyed to each lead → Meta finds buyers (needs Anthony's CRM) | now |
| 4 | **Renters is the flagship** — only P&C line gaining penetration; biggest gaps are the funnel's exact audience | 60.4% penetration 2025 (eMarketer); Gen Z 21% covered (NAIC); Hispanic ~29% vs ~55% | Keep renters dominant + $5.50 H1; frame as **first-timer education**, plain language, no jargon above the fold | now |
| 5 | **Trilingual is a real moat** the directs serve English-only — but translation ≠ transcreation | Latino GDP $4.1T, 30.6% of US growth ’19–’23 (Triple-I); decisions made on trust/family; Gaston ~9.9% Hispanic | Native-review ES/HT before more spend; make Anthony the in-language trust object; route ES/HT to language-capable follow-up | now |
| 6 | **TCPA ground shifted** — one-to-one vacated (Jan 2025); single-agent funnel is now the cleanest posture | 11th Cir. *IMC v. FCC*; FCC repealed Aug/Sep 2025; prior-express-written-consent back; opt-out in 10 biz days (Apr 2025) | Audit consent (named seller, unchecked-default, not-a-condition, readable not tiny-gray, recorded) ×3 languages; add underwriting disclaimer | now |
| 7 | **The wedge is the human agent, not cheapest-in-5-min** | Direct writers +7pts share but only 26% trust chatbots, 53% find human agents more credible (J.D. Power) | Keep price/speed hook; pair with "a real local agent, not a chatbot," claims-help, Anthony's photo/name/Gastonia | now |
| 8 | **Intent-trigger paths capture the hottest leads** | Landlord proof-of-coverage mandates; NC non-renewals rising; NC auto ~5% (Oct 2025); home filings pending | Add "my landlord requires proof" (renters) / "got a non-renewal?" (home) reason flags so Anthony calls those first | now |
| 9 | **Auto: drop "rates exploding"** — rates fell ~6% in 2025, ~flat 2026; 73% switch for price | Insurify -6% to $2,144; Consumer Reports 73% switch on price; bundling in structural decline | Funnel already says "same car, better rate" (good); keep agent/trust as tie-breaker; bundle is post-lead LTV, not the hook | now |
| 10 | **Form minimalism + mobile-first is the cheapest CRO** — every field leaks; finance CPCs ~$1.22 | 11→4 fields ≈ +120% (Zuko/Unbounce); insurance form-fill 6–8% median | Hold the single-step floor; add persistent click-to-call **and** one-tap click-to-text; finish the perf/no-FOUC items | now |
| 11 | **Off-funnel trust decides the click** — ~89% read Google reviews; zero-click/AI-Overviews rising | Reviews lift conversion 15–20%; AI Overviews on ~68% of local searches; 42% used AI to shop car insurance | Real recent reviews above the form (FTC: real only); LocalBusiness/FAQ schema so AI engines cite Anthony | 6–12mo |

## New backlog items (market-driven)

| Item | Driving trend | Impact | Risk | Needs Nash? |
|---|---|---|---|---|
| Instant in-language auto-reply text to the lead | speed-to-lead | high | med | **Yes** — 10DLC texting number + compliance + es/ht |
| CAPI high Event Match Quality + Consent Mode v2 | signal loss + CIPA | high | low | **Yes** — Meta/Google access (CAPI itself already built) |
| Conversion Leads: quoted/bound events to Meta | lead-quality lever | high | low | **Yes** — CRM outcome data |
| Trilingual consent + NC/FTC disclosure parity audit | TCPA/NC liability | high | med | **Yes** — compliance wording + pro es/ht translation |
| Renters first-timer education framing | renters under-penetration | high | low | Partial — EN safe; es/ht transcreation |
| Intent-trigger paths (landlord-proof / non-renewal) | hottest leads | high | low | **Yes** — operational truth + CRM flag + es/ht |
| **Agent-advocacy trust line ("real agent, not a chatbot")** | human-trust wedge | med | low | **No** (EN ship; es/ht draft) ✅ shipped |
| Auto H1 reframe + bundle checkbox | auto price-switching | med | low | Brand call (already "same car, better rate") |
| **Persistent one-tap click-to-text + click-to-call** | SMS preference | med | low | **No** (uses existing number) ✅ shipped |
| **LocalBusiness/InsuranceAgency + FAQ schema** | AI-answer-engine citability | med | low | **No** (facts already known) ✅ shipped |
| Real recent Google reviews block | review trust currency | med | med | **Yes** — real reviews (no fabrication, FTC) |
| Per-partner tracked landing variant | partner channel | med | low | **Yes** — partner list + reporting |
| STOP/unsubscribe suppression list | TCPA opt-out rule | med | low | **Yes** — lives in CRM/texting platform |

## Strategic notes (beyond the funnel — for Nash)

1. **Trilingual is the moat — treat ES/HT as first-class products**, gated on native-speaker transcreation + in-language consent + language-capable follow-up. Pure translation actively *destroys* trust with this audience. Decide whether Anthony has Spanish-capable follow-up before scaling ES spend.
2. **Reposition Haitian-Creole** as a near-zero-cost partner / door-to-door / credibility asset (≈13K HT speakers statewide is too thin for efficient cold Meta spend), leaning on church/community word-of-mouth. A hedge, not a budget line.
3. **Embedded insurance at lease-signing (Cover Genius / ElevateOS) is the structural threat** — it grabs renters at peak intent before any agent sees them. The leasing-office partner channel is the defense; pitch what embedded can't do (named agent, claims, auto bundle) + a "compliant proof in 5 minutes" link.
4. **Geo-target discipline** — concentrate paid social + canvassing on Gaston/Gastonia + west-Charlotte ZIPs around new lease-ups and Hispanic-dense tracts, where $5.50/mo lands hardest.
5. **Treat the renters lead as the front door to the household** — a renters policy sold to a 23-year-old can persist 10–15+ years; the real prize is the auto bundle (then life). Build the renters→auto→life cue into the thank-you state + follow-up.
6. **An honest, informational AI concierge** (TSD's RAG wheelhouse) on the pages would meet rising "AI help me shop" expectations + pre-qualify — kept strictly informational with explicit hand-off to "Anthony will text you," never binding quotes. "AI answers, human closes."
7. **Operational dependency** — several top-ROI items (auto-reply text, conversion-event optimization, suppression list, intent routing) depend on Anthony's stack: a **10DLC-registered texting number** and a **CRM that tracks quoted/bound**. Confirm these before building — a perfect front-end still loses if reply texts are blocked or outcomes aren't captured.
8. **State Farm brand/compliance sign-off** is a faster funnel-killer than any regulator — a third-party site using the SF name needs clearance on logo/trademark, agent-ID framing, and the $5.50 / "covered in 5 minutes" claims. Required gate before scaling spend, via Anthony's SF compliance contact.
