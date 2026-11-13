# ASTER — English Product Video Production Report

## 1. Mandate

Create a premium, narrated English product film showing the actual implemented ASTER application. The result should have the precision and pacing of a high-quality software launch video while remaining scientifically honest.

The final deliverable is rendered video with recorded or generated licensed narration, synchronized captions, sound design, and real working-product footage. A script, storyboard, silent slideshow, Remotion preview, or imaginary interface alone is not completion.

This document is the production plan. The current documentation bundle does not include rendered video or imply that the application has already been built.

## 2. Deliverables

| Deliverable | Format | Purpose |
|---|---|---|
| Main product film | 1920×1080, 30 fps, approximately 105 seconds, H.264 MP4 | Explain the product and demonstrate its connected workflow. |
| Social cut | 1080×1920, 30 fps, approximately 35 seconds, H.264 MP4 | High-quality vertical introduction, reframed rather than blindly cropped. |
| Technical walkthrough | 1920×1080, 30 fps, 3–4 minutes | Longer actual-use demonstration with fewer edits and explicit prototype boundaries. |
| Captions | UTF-8 SRT and WebVTT | Accessibility and reuse; vertical cut also includes burned-in captions. |
| Narration master | 48 kHz WAV, plus original source where available | Re-editable voice track. |
| Editable composition | Remotion source, local assets, render scripts | Reproducible production. |
| Capture and claim manifest | JSON/Markdown | Link every shot to release commit, scenario, source origin, and claim. |
| Poster frames | Landscape and vertical PNG/WebP | README and release previews. |

Suggested paths:

```text
media/video/src/compositions/
media/video/src/scenes/
media/video/public/captures/
media/video/public/audio/
media/video/public/captions/
media/video/public/graphics/
deliverables/video/ASTER_Product_Film_1080p.mp4
deliverables/video/ASTER_Social_9x16.mp4
deliverables/video/ASTER_Technical_Walkthrough.mp4
deliverables/video/captions/
deliverables/video/posters/
deliverables/video/video-manifest.json
deliverables/video/qa-report.md
```

Do not commit large raw video to ordinary Git. Deliver rendered files through verified GitHub Release assets or an explicitly configured large-file workflow.

## 3. Creative direction

Tone: confident, technical, calm, and specific. Create anticipation through a clear question and a visible resolution. Avoid exaggerated emergency drama, constant alarms, synthetic panic, or claims that the prototype saves lives.

Visual language: dark graphite scenes for operational context, white evidence scenes for explanation, restrained cyan for selection, amber/red only for meaningful state. Typography and iconography match the application. Use dimensional screen staging only when it preserves UI legibility.

Prefer one continuous scenario across modules: routine exercise → altered local gas context → contact slip → evidence-linked event → interrupted uplink → ground reply. Brief independent scenes can introduce each module, but the main film should feel like one product.

The most important “wow” moment is visible behavior: a changing mechanical waveform is not immediately labeled a health decline because the product detects unreliable contact, while a separate valid exposure observation remains available. Use authentic implemented outputs; do not fake this sequence through video overlays.

The product name ASTER remains provisional until implementation branding is frozen.

## 4. What counts as real product footage

- Capture a running release build with an identified commit, scenario, seed, locale, theme, and viewport.
- Use actual mouse/keyboard interactions, route transitions, charts, event creation, queue states, and ground replies.
- UI values and decisions must come from the application. Titles, arrows, callouts, and explanatory diagrams may be added in postproduction.
- Preserve visible simulation/experimental labels or reproduce them clearly in the framing if a tight crop removes the original badge.
- Do not paint a successful hardware connection over an emulator, fabricate a benchmark chart, remove a failure to imply robustness, or create a ground reply before the transport delivers it.
- A conceptual wearable render is allowed only if labeled “Hardware concept.” Do not imply a physical device has been manufactured or worn in space.
- If replay or link delay is accelerated, label it “Accelerated simulation.” There is no need to make the audience wait through a long simulated propagation delay.
- Keep the camera/cursor movement deliberate and readable. Avoid frantic clicking and microscopic full-dashboard recordings.

## 5. Main film storyboard — target 105 seconds

The sequence below is a timing target. Record narration first, then refine shot boundaries to the delivered voice. Do not distort the voice to force a predetermined duration.

| Time | Shot and action | On-screen line | Evidence/production requirement |
|---|---|---|---|
| 0–7 s | A real waveform changes; adjacent source/quality marker becomes the focal point | “What changed?” | No invented emergency diagnosis. |
| 7–15 s | Three simple original diagrams: environment, body, sensor coupling | “Environment. Body. Measurement.” | Explanatory graphics, not false product capabilities. |
| 15–24 s | ASTER overview opens; select a seeded mission and start the scenario | “ASTER · Space Health Research Console” | Actual launch interaction; persistent prototype label. |
| 24–39 s | Exposure screen; linked cursor reveals inspiration window and local/cabin difference | “Align the measurement with the breath.” | Measured/estimated traces clearly distinguished. |
| 39–54 s | Integrity screen; simulated contact change; calibration/quality state updates | “Check the connection.” | Show unavailable interpretation if correction is unsupported. |
| 54–69 s | Exercise session; compare matched load and inspect impedance context | “Compare like with like.” | No atrophy diagnosis or invented muscle-health score. |
| 69–82 s | Event drawer; reveal quality, rule, evidence, and limitations | “Every interpretation has a reason.” | Real event and source links. |
| 82–94 s | Split mission/ground view; queued package delivers and receives a revision-linked reply | “Local continuity. Ground review.” | Actual transport behavior; accelerated-delay label where needed. |
| 94–100 s | Simulation Lab and a restrained actual evaluation figure | “Reproducible scenarios. Visible limits.” | Use results only if completed; otherwise show evaluation controls, not invented gains. |
| 100–105 s | Product lockup, repository link, restrained build credit | “Explore ASTER.” | Verified URL and honest AI-assistance attribution. |

## 6. Main English narration — production draft

The following text describes intended release behavior. Before recording, check every sentence against the completed implementation and modify any unverified claim. Read ASTER as “AS-ter”; pronounce PVDF letter by letter if used in alternate takes.

> In space, a changing signal can tell more than one story. The environment may have changed. The body may be responding. Or the sensor may have lost reliable contact.
>
> Meet ASTER: an offline-capable research console that brings those possibilities into view.
>
> Breathing and Exposure aligns local carbon dioxide measurements with the respiratory cycle. It explores what the crew member may be inhaling, while showing the limits of the estimate.
>
> Sensor Integrity checks the quality of the measurement connection. When contact becomes unreliable, ASTER marks the affected interpretation instead of presenting uncertain data as a confident conclusion.
>
> Exercise and Muscle Response compares similar activity under similar loads, with mechanical signals and fluid-sensitive measurements kept in context.
>
> Each event connects observations, quality checks, and versioned rules to an inspectable explanation.
>
> When the ground link is unavailable, the case remains accessible locally. When communication resumes, its evidence can be delivered and reviewed, with replies linked to the correct revision.
>
> A reproducible simulation lab lets researchers challenge these methods with noise, missing data, and conflicting signals.
>
> ASTER is a research prototype, demonstrated with simulated data. Its purpose is to make the evidence, the uncertainty, and the next research step visible.

This is approximately 200 words. Target a natural 125–140 words per minute with pauses; let the final recorded duration determine the exact edit. Do not add a quantitative superiority claim unless it has passed the claim ledger.

## 7. Vertical social cut — target 35 seconds

### Structure

- 0–4 s: changing trace and the question “The body—or the sensor?” Use this only as a narrative question, not a claim that the system always distinguishes them.
- 4–11 s: tight exposure screen crop with a highlighted inspiration interval.
- 11–18 s: contact-quality change and a withheld interpretation.
- 18–25 s: exercise comparison followed by a compact evidence card.
- 25–30 s: offline queue → delivered case, labeled accelerated simulation.
- 30–35 s: product name, repository, prototype label, build credit if accurate.

### English voiceover

> What if a changing health signal came from the sensor itself?
>
> ASTER brings breathing exposure, sensor integrity, and exercise response into one offline-capable research console.
>
> Follow the measurement. Inspect its quality. See the evidence behind each event.
>
> And when the ground link returns, share the case with its context intact.
>
> Built for reproducible exploration. Demonstrated with simulated data.
>
> This is ASTER.

Reframe each shot for vertical viewing. Use close-ups and split panels instead of shrinking a 16:9 dashboard. Keep important content at least 96 px from the sides, 180 px from the top, and 300 px from the bottom as a conservative working safe area; verify the current target platform overlay before release.

## 8. Technical walkthrough

Record a 3–4 minute English walkthrough containing:

1. Show version, source origin, theme, and selected scenario.
2. Load a scenario from bundled local data and explain its assumptions.
3. Start the run; inspect exposure, integrity, and exercise screens.
4. Trigger a contact fault; show the downstream effect on interpretation.
5. Open the event reasoning and source/procedure status.
6. Set the simulated ground link unavailable; inspect persistent queue state.
7. Restore the link and send a ground reply; inspect revision matching.
8. Demonstrate real offline reload separately from merely setting the simulated link to offline.
9. Open the evaluation view and identify simulator truth as a researcher-only reference.
10. State what is implemented, what is experimental, and what hardware remains unverified.

Use fewer cuts than the main film. This artifact is evidence of working software, not only advertising.

## 9. Voice and sound production

Use a licensed English voice with a clear, technically literate delivery. Do not imitate an astronaut, NASA official, celebrity, or a particular identifiable person. The user has requested English narration, not a voice clone.

Select an available TTS service or a capable local voice engine after checking current documentation, licensing, and access. Do not assume a paid account or fabricate audio if credentials are missing. A genuine recorded English voice is an acceptable alternative. Record the chosen provider/model/voice and license in the media manifest, without secrets.

Suggested pronunciation glossary: ASTER “AS-ter”; CO2 “carbon dioxide”; MMG “M M G”; bioimpedance “bio impedance”; telemetry “teh-LEM-uh-tree.” Prefer expanded phrases in the script when clearer.

Record/render narration as a local file before composition. Do not depend on browser speech synthesis during final video rendering. Keep the original WAV and an edited master. Generate captions from the final audio and manually review technical terminology.

Mixing targets: approximately −16 LUFS integrated for the finished stereo master, true peak no higher than −1 dBTP, no clipping, and consistently intelligible speech. Use understated licensed music; duck it during speech. Sound effects should mark deliberate transitions, not resemble real emergency alerts. Verify with loudness measurement and listening, not only a waveform screenshot.

If an external voice service is unavailable, finish captures, composition, captions draft, and all other work, then report the missing voice dependency precisely. Do not mark a silent export as a completed narrated deliverable.

## 10. Capture and Remotion workflow

1. Read the installed Remotion skills and inspect the app's release manifest.
2. Run the actual application in a clean demo state. Use a stable seed, local assets, English locale, and the appropriate theme.
3. Capture at sufficient resolution, with cursor and text large enough for the intended crop. Playwright can drive repeatable interactions, but the resulting state must be real.
4. Save a capture manifest with app commit, scenario ID/version, seed, viewport, browser, time range, and data origin.
5. Record final narration; generate timing and reviewed captions.
6. Build separate Remotion compositions for the landscape and vertical films. Reuse semantic scenes, but redesign framing for the aspect ratio.
7. Use local captured clips for product scenes. Original vector overlays may explain the data flow. Do not recreate a better-looking fake UI in Remotion.
8. Keep transitions purposeful: 8–16 frame cuts/overlaps, subtle screen movement, restrained callout reveals. Use frame-based deterministic animation and avoid live network fetches during render.
9. Preview every scene, inspect frames at transitions, then render the requested MP4s.
10. Use ffprobe and loudness checks to verify dimensions, frame rate, duration, codec, audio presence, and output integrity.
11. Watch the entire exported files with sound. Inspect captions, crops, artifacts, continuity, and claim labels.
12. Render poster frames from actual video and attach downloadable artifacts to the repository release.

## 11. Attribution and scientific claims

Optional final build credit, only if accurate: “Built with Claude Fable 5.2 · Created by [verified team name].” If multiple tools/models were used, use an accurate broader statement and record details in the README. AI assistance must not replace attribution to the team's work or the cited researchers.

No NASA logo implying partnership, no invented testimonial, no award badge, no “first in the world,” and no “clinically proven.” If NASA imagery is used, verify the specific image's terms and attribution; do not assume every asset is unrestricted.

Do not say “we prevent muscle loss,” “we detect hypercapnia,” or “we make spaceflight safe.” Prefer implemented and bounded statements: “compares matched exercise segments,” “estimates inhalation-phase concentration in simulation,” and “shows measurement uncertainty.”

## 12. Final video acceptance checklist

- [ ] All primary scenes show the shipped application, not generated interface illustrations.
- [ ] Main, vertical, and walkthrough videos are actually rendered and playable.
- [ ] English narration is present and intelligible throughout intended spoken sections.
- [ ] Captions match the final voice and technical terms are correct.
- [ ] Simulation, experimental estimates, conceptual hardware, and accelerated time remain distinguishable.
- [ ] No quantitative claim lacks a matching evaluated result.
- [ ] Offline operation is demonstrated honestly, with its provisioning/process limits.
- [ ] Landscape and vertical crops are separately reviewed for legibility.
- [ ] No clipping, black frames, missing fonts, unlicensed music, or unintended private data.
- [ ] Audio loudness, dimensions, frame rate, duration, and file integrity are recorded.
- [ ] Editable source, asset manifest, captions, poster frames, and final downloads are linked.
