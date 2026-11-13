# ASTER product video — production package and status

## Status: NOT RENDERED

No narrated video exists yet. This folder is a production package, not a finished deliverable.

**Blocker.** The film was to be generated through the Higgsfield connector. In the build session that connector was not connected (no Higgsfield tool was exposed and none is listed in the connector registry), and no other video-generation, TTS/voice or full FFmpeg toolchain was available. A silent export or a slideshow would not meet the brief, so none was produced.

**To finish:** connect the Higgsfield connector (or provide another video/voice tool) and run the plan below. Everything that does not depend on it is ready.

## What is ready

| Item | File | Notes |
|---|---|---|
| Real product footage, 1920×1080, silent, ≈ 70 s | `../captures/ASTER_product_capture_SIM-11_seed11_1080p.webm` | Recorded from the running application (scenario SIM-11, seed 11, 10× accelerated simulation shown in the product strip). No post-production. |
| Real product stills (dark, light, TR, AR, JA, DE) | `../captures/*.png`, `../captures/capture-manifest.json` | For close-ups, vertical reframing and poster frames |
| Narration scripts (main ≈ 105 s, vertical ≈ 35 s, walkthrough 3–4 min) | `narration.md` | Every sentence checked against the implementation and the claim ledger |
| Shot list with source timecodes and on-screen lines | `shot-list.md` | Maps each storyboard beat to the captured footage or a still |
| Generation prompts for non-product inserts | `higgsfield-prompts.md` | Abstract/explanatory shots only; product scenes must be the real capture |
| Draft captions (main film) | `captions/ASTER_Product_Film_draft.srt` | Estimated timing at ≈ 135 words/min; **must be regenerated from the final voice track** |
| Manifest | `video-manifest.json` | Sources, claims, open dependencies |

## Rules that still apply when the film is rendered

1. Primary scenes show the real application. Do not regenerate, repaint or "improve" the interface with a video model; generated footage is limited to the abstract inserts in `higgsfield-prompts.md`.
2. Keep "Research prototype · Simulated data" visible or restated in every scene that could be mistaken for a clinical result; label fast playback "Accelerated simulation"; label any wearable render "Hardware concept".
3. No NASA logo, no testimonial, no award badge, no "clinically proven", "first" or "saves lives". No number that is not in `docs/CLAIM_LEDGER.md`.
4. Voice: a licensed, clearly synthetic or recorded English voice; no imitation of an astronaut, official or identifiable person. Record provider, model, voice and licence in the manifest.
5. Targets: 1920×1080 and 1080×1920, 30 fps, H.264 MP4; ≈ −16 LUFS integrated, true peak ≤ −1 dBTP; SRT + WebVTT captions generated from the final audio; poster frames from the rendered video.
6. Closing credit, only if still accurate: "Built with Claude Fable 5.2 · Research prototype".

## Acceptance checklist (all open)

- [ ] Main film, vertical cut and walkthrough rendered and playable
- [ ] English narration present and intelligible
- [ ] Captions match the final voice
- [ ] Simulation / experimental / concept / accelerated labels visible
- [ ] Loudness, dimensions, frame rate, duration and integrity recorded
- [ ] Poster frames and final links added to the README
