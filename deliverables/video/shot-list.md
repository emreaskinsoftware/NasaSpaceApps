# Shot list — main film (target ≈ 105 s)

Source footage: `../captures/ASTER_product_capture_SIM-11_seed11_1080p.webm` (SIM-11, seed 11, dark theme, 1920×1080, 10× accelerated simulation). Timecodes are approximate offsets in that recording; confirm on the timeline before cutting. Stills are in `../captures/`.

| # | Film time | Source | In the frame | On-screen line | Label required |
|---|---|---|---|---|---|
| 1 | 0–7 s | Recording ≈ 0:30–0:38 (Sensor Integrity, mechanical signal chart) — tight crop on the trace and the quality badge | The waveform shrinks; the "Invalid" contact badge appears | "What changed?" | Simulated data |
| 2 | 7–15 s | Generated/drawn insert A (see `higgsfield-prompts.md`) or original vector diagram | Three abstract panels | "Environment. Body. Measurement." | Explanatory graphic |
| 3 | 15–24 s | Recording 0:00–0:08 (landing → Start demo → Run) | Real launch interaction | "ASTER · Space Health Research Console" | Research prototype |
| 4 | 24–39 s | Recording ≈ 0:14–0:24 (Breathing & Exposure, cursor sweep) or still `exposure-dark.png` with slow push-in | Shaded inhalation windows, local vs cabin trace, per-breath markers | "Align the measurement with the breath." | Experimental estimate |
| 5 | 39–54 s | Recording ≈ 0:30–0:40 (Sensor Integrity) + still `integrity-dark.png` | Contact force drop, calibration lifecycle, rejected windows | "Check the connection." | Simulated data |
| 6 | 54–69 s | Recording ≈ 0:40–0:46 (Exercise) + stills `exercise-withheld-dark.png`, `exercise-matched-dark.png` | "Not comparable" during the fault; matched comparison from SIM-08 | "Compare like with like." | Experimental estimate; SIM-08 for the matched view |
| 7 | 69–82 s | Recording ≈ 0:48–0:55 (case detail) or `case-detail-dark.png` | Observation → quality → rule → evidence → next step; limitations | "Every interpretation has a reason." | Procedure not validated |
| 8 | 82–94 s | Recording ≈ 0:55–1:08 (Ground Console → reply → case) + `cases-queued-dark.png`, `ground-received-dark.png`, `case-reply-dark.png` | Queued → delivered → reply linked to revision | "Local continuity. Ground review." | Accelerated simulation |
| 9 | 94–100 s | Recording ≈ 1:08–1:12 (Simulation Lab) + `lab-evaluation-dark.png` | Scenario gallery; held-out table | "Reproducible scenarios. Visible limits." | Held-out simulation |
| 10 | 100–105 s | Lock-up on plain graphite | ASTER wordmark, `github.com/umitcancinar/NasaSpaceApps` (only once the code is actually published there) | "Explore ASTER." | Research prototype · Built with Claude Fable 5.2 |

## Vertical cut (1080×1920, ≈ 35 s)

Reframe from stills, not by cropping the 16:9 recording: (1) `integrity-dark.png` trace + badge, 0–4 s, "The body — or the sensor?"; (2) `exposure-dark.png` gas chart close-up, 4–11 s; (3) `integrity-dark.png` decision card, 11–18 s; (4) `exercise-withheld-dark.png` comparison card then `case-detail-dark.png` chain, 18–25 s; (5) `cases-queued-dark.png` → `ground-received-dark.png`, 25–30 s, "Accelerated simulation"; (6) lock-up, 30–35 s. Keep key content ≥ 96 px from the sides, ≥ 180 px from the top and ≥ 300 px from the bottom; burn in captions.

## Technical walkthrough

Record a fresh, less-edited take following `narration.md` §3. `pnpm capture:product` shows how the app is driven; for the walkthrough use 1× or 10× speed and include the real-offline step (DevTools "Offline" or unplugged network), which the current recording does not contain.
