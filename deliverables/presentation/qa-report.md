# Presentation QA report

Decks: `ASTER_Product_Overview` (EN, 14 + 3 appendix), `ASTER_Short_Pitch` (EN, 7), `ASTER_Urun_Sunumu_TR` (TR, 17), `ASTER_Kisa_Sunum_TR` (TR, 7).

## How they were produced and checked

1. `pnpm slides:build` — pptxgenjs writes editable PPTX files from `media/presentation/content.ts` (copy) and `scripts/slides-build.ts` (layout). Titles, bullets, diagrams, chips and tables are native shapes/text; only product screenshots are raster.
2. `pnpm slides:verify` — the locally installed Microsoft PowerPoint opens each PPTX (COM automation), exports the PDF and one 1600×900 PNG per slide into `thumbnails/<deck>/`. This is a true render of the PPTX, not a second layout.
3. `python scripts/contact-sheet.py <deck>` — contact sheets (`_sheet-*.png`) used for visual inspection.

## Inspection results

| Check | Result |
|---|---|
| Every slide of the EN and TR full decks inspected on contact sheets | Done; issues below were fixed and the decks re-rendered |
| Clipping / overlap | Fixed: slide 6 screenshot overlapped the two-line title; full-page screenshots were distorted on slides 9 and 14 (replaced with viewport captures); slide 13 chip text tightened |
| Text size | Titles 34 pt, body 14–22 pt, footers 11 pt. Table cells on slide 11 are 13 pt and Appendix B 11 pt — smaller than the 20 pt body target of the brief, accepted for tables |
| Words per slide | Main slides are within the 35–55 word guide except slide 11 (results table) and the appendices |
| "Research prototype · Simulated data" label | Present on every slide (footer) |
| Screenshots match the build | Captured from the production build by `tests/capture/capture.spec.ts`; see `asset-manifest.json` and `../captures/capture-manifest.json`. Build is the working tree of the commit that contains this file |
| Numbers | Injected from `deliverables/reports/evaluation.json` and `test-summary.json` at build time; no hand-typed result |
| Claims | Checked against `docs/CLAIM_LEDGER.md`; prior art named without logos; no endorsement, award, patent or flight-readiness claim |
| Hyperlinks | Repository link on slide 14 and source links on Appendix C are clickable in PPTX and PDF. The repository link is the repository this release is pushed to. No QR code is used |
| Fonts | Segoe UI and Consolas (system fonts). On a machine without them PowerPoint will substitute; the PDF is safe |
| Speaker notes | In every slide and in `speaker-notes.md` / `konusmaci-notlari-TR.md`; the short-pitch path is identified there |
| Turkish deck | Same structure; Turkish product captures where available (overview, exposure, cases, case detail, ground), English captures elsewhere |

## Open items

- Slide screenshots were re-captured after the visual redesign (Motion animations, new entry screen); the decks show the current build.
- Team name is not on the title slide: no confirmed team identity was available. Add it before presenting.
- The short decks were inspected as contact sheets only, not presented at projector scale.
- Turkish copy was written by the build agent and has not been proof-read by a second native speaker.
- Competition pitch length/format requirements were not verified (the supplied challenge page was unreachable when the specification was written).
