# ASTER — English Presentation Production Brief

## 1. Deliverable and purpose

Create an editable, professional English presentation about the implemented ASTER product. Deliver PPTX, PDF, slide thumbnails, and editable authoring source. This document is a production brief and content specification, not the finished slide deck.

Audience: Space Apps judges, engineers, scientific reviewers, and potential research collaborators. The deck should explain the problem, prior art, candidate contribution, working implementation, evidence, limitations, and next validation step. It must remain understandable without the presenter having read the development conversation.

Produce a 14-slide main deck plus three technical appendix slides. Also identify a seven-slide short-pitch path in speaker notes. Verify the actual competition's pitch/submission constraints before choosing the final short version; no duration requirement is assumed here.

## 2. Required files

```text
media/presentation/                 # editable authoring source and approved assets
deliverables/presentation/ASTER_Product_Overview.pptx
deliverables/presentation/ASTER_Product_Overview.pdf
deliverables/presentation/ASTER_Short_Pitch.pptx
deliverables/presentation/ASTER_Short_Pitch.pdf
deliverables/presentation/thumbnails/
deliverables/presentation/speaker-notes.md
deliverables/presentation/asset-manifest.json
deliverables/presentation/qa-report.md
```

Do not deliver a deck made entirely of raster screenshots. Keep headings, diagrams, explanatory labels, and charts editable where the authoring tool supports them. Actual application screenshots remain raster captures and must be sharp enough to read.

## 3. Visual direction

- 16:9 landscape, consistent with the application's design tokens.
- Alternate deliberate dark instrument slides with clean white evidence slides. Both must work on a projector.
- One main message per slide; usually at most 35–55 on-slide words excluding source footnotes.
- Titles around 32–40 pt, body 20–24 pt, concise footnotes 11–13 pt. Verify at presentation scale.
- Use a recognizable visual grammar: measured traces as solid lines, experimental estimates as a distinct labeled treatment, unavailable intervals as gaps/hatching, simulator reference only in labeled evaluation views.
- Prefer original SVG diagrams and actual product captures. Avoid stock doctors, decorative astronauts, generic AI brain imagery, or NASA logos used as endorsements.
- A small “Research prototype · Simulated data” label must remain readable on every slide that could be mistaken for a clinical result.
- Use consistent English terminology: “Breathing & Exposure,” “Sensor Integrity,” “Exercise & Muscle Response,” “Ground Console,” and “Simulation Lab.”

## 4. Slide-by-slide content

### Slide 1 — ASTER

**Headline:** Space health monitoring, with the evidence in view.

**Supporting line:** An offline-capable research console connecting breathing exposure, sensor reliability, and exercise response.

**Visual:** Real shipped overview screenshot, tightly framed. Working product name and team name; use only confirmed team identities.

**Notes:** State that this is a simulation-first prototype. Do not open with a claim of clinical validation.

### Slide 2 — A measurement can change for different reasons

**On-slide:** “The environment. The body. The sensor connection.”

**Visual:** Three aligned examples: local gas versus inhalation interval; mechanical signal before/after attachment change; exercise response under different loads.

**Notes:** Explain ambiguity using one coherent crew-day story. Avoid implying current NASA systems ignore all context.

### Slide 3 — Build on what already exists

**On-slide:** “Smart garments, personal gas monitors, and integrated data systems already exist.”

**Visual:** Restrained prior-art map containing Bio-Monitor/Artemis, MagIC-Space, NASA personal CO2, and CHP-IDSP/xEHR. Show cited names, not unauthorized partner logos.

**Notes:** Explain that the proposed contribution is a set of specific measurement-interpretation methods and a reproducible evaluation workflow. Sources: S01–S06 and S15–S16.

### Slide 4 — Three research questions, one workflow

**On-slide:**

1. What air was inhaled?
2. Did the sensor coupling change?
3. Is this exercise response comparable?

**Visual:** Inputs → quality and synchronization → module estimates → evidence-linked event → local review/ground exchange.

**Notes:** Distinguish the three hypotheses from the common application infrastructure. No invented “universal health score.”

### Slide 5 — Breathing & Exposure

**Headline:** Align the gas measurement with the breath.

**Visual:** Real exposure screen plus one annotated inhalation interval. Show local/cabin measurements and an experimental estimate with units.

**Notes:** NASA's cited risk record distinguishes personal measurements from inspired levels. Explain sampling delay and why a time-weighted estimate is not inhaled dose. Respiratory gating itself is prior art. Sources S05–S06.

### Slide 6 — Sensor Integrity

**Headline:** Check the measurement connection before interpreting the change.

**Visual:** Real contact-slip scenario and calibration lifecycle. A small original diagram shows sensor, reference actuator, and contact measurement; label the hardware arrangement as a concept unless physically built.

**Notes:** Known excitation is a research approach; calibration-path mismatch can invalidate correction. Sources S07–S09.

### Slide 7 — Exercise & Muscle Response

**Headline:** Compare like with like.

**Visual:** Actual matched-session view with load, movement, MMG, and impedance context. Display an ineligible comparison alongside an eligible one if readable.

**Notes:** The prototype does not diagnose atrophy or prove exercise efficacy. It investigates a better interpretation of measured response. Sources S10–S14.

### Slide 8 — One event, an inspectable explanation

**On-slide:** “Observation → quality → rule → evidence → next review step.”

**Visual:** Actual event drawer showing source, rule version, input interval, limitation, and guidance status.

**Notes:** Explain why unavailable evidence remains unavailable. Show that a mechanical-sensor fault does not suppress an independently valid environmental event.

### Slide 9 — Local continuity, asynchronous ground review

**Headline:** Keep the case available when the link is not.

**Visual:** Actual mission and ground views: queued → delivered → ground reply. Clearly label accelerated or simulated delay.

**Notes:** The product persists evidence and revisions; it does not shorten physical propagation delay or connect to NASA mission control. Sources S15–S16 establish context, while the product transport test establishes implementation.

### Slide 10 — A simulator that does not give the engine the answer

**Visual:** Two separate lanes: latent scenario truth → noisy observation model → engine; truth + engine output → evaluator. Include a crossed-out direct truth-to-engine arrow.

**On-slide:** “Seeded scenarios. Hidden truth. Held-out conditions. Meaningful baselines.”

**Notes:** Name three adversarial scenarios: slow gas sensor, calibration mismatch, and load mismatch. Explain that synthetic success alone is not clinical evidence.

### Slide 11 — What the implementation demonstrates

**Visual:** A compact test/evaluation table generated from actual release artifacts.

Rows: deterministic replay; offline reload; three-module case; duplicate-safe ground exchange; method-comparison result; unsupported-condition handling.

**Notes:** Use only executed test results. For scientific comparisons, state reference, seed count, comparator, coverage, and error. If an enhancement did not improve results, say so. Do not leave fake percentages or “TBD” in the final deck; substitute a truthful limitation when evidence is unavailable.

### Slide 12 — Designed for real use

**Visual:** Two actual screenshots demonstrating dark/light themes and one localized layout. Small diagram of replay/device/gateway entry points.

**On-slide:** “Offline after provisioning. Accessible controls. Seven core locales. Versioned integrations.”

**Notes:** Each phrase requires verification. Device support must be labeled by emulator, recording, or hardware verification. English remains the main presentation language.

### Slide 13 — What remains to be proven

**On-slide:** “Reference-instrument comparison → controlled human study → analog environment → flight evaluation.”

**Visual:** Evidence ladder with the current step visibly marked. Separate software verification from physiological validation.

**Notes:** Three key risks: near-face sampling mismatch, calibration transfer mismatch, and confounded muscle-response interpretation. Do not claim a regulatory pathway or validation schedule that has not been established.

### Slide 14 — Explore the working product

**Headline:** Every signal has a source. Every interpretation has a reason.

**Visual:** Product screenshot, repository URL, and a QR code only if it resolves to a verified working link.

**On-slide:** `github.com/umitcancinar/NasaSpaceApps`

**Notes:** Invite evaluation of the working prototype and reproducible scenarios. Include honest AI-assistance credit and team contribution; do not imply that a NASA invitation or award has been earned.

### Appendix A — Data and architecture

Show contract boundaries, worker/gateway profiles, source/quality/interpretation labels, and the lack of truth access by inference.

### Appendix B — Method comparison details

Show exact baselines, ablations, held-out parameter ranges, reference definitions, and representative failure cases from actual reports.

### Appendix C — Sources and claims

Provide compact references to the scientific ledger and claim ledger. Keep all citations clickable in PDF where supported. Include data and asset provenance.

## 5. Short-pitch selection

Default seven-slide sequence: 1, 2, 4, a combined 5–7 module slide, 8, a combined 10–11 evidence slide, and 14. Retain limitations in narration and a visible prototype label. Use slide 13 if the allocated duration allows it. Do not omit prior art from the full deck just to create an illusion of novelty.

## 6. Production workflow

1. Freeze release UI and collect real screenshots at a consistent viewport and seed.
2. Gather evaluated results and approve every quantitative statement in the claim ledger.
3. Use the installed presentation skill and a reusable theme to build editable slides.
4. Write presenter notes with a concise narrative, scientific caveat, and source reference where needed.
5. Export PDF and render every slide to images.
6. Inspect images for clipping, overlap, text size, chart legibility, contrast, and consistency. Repair and rerender.
7. Check hyperlink/QR destinations, font substitution, notes, and English copy.
8. Review the short deck separately; condensed layouts require their own visual inspection.

## 7. Acceptance checklist

- [ ] All slides are in English and use consistent terminology.
- [ ] Product screenshots match the delivered commit.
- [ ] Simulated/experimental outputs are explicitly labeled.
- [ ] No invented result, partnership, endorsement, patent, or flight readiness claim.
- [ ] Every result traces to a report and every research assertion to a source.
- [ ] PPTX opens and remains meaningfully editable.
- [ ] PDF renders correctly and all slides have been inspected.
- [ ] Speaker notes and a short-pitch version are included.
- [ ] All asset permissions/provenance are documented.
- [ ] README links to the actual downloadable files.
