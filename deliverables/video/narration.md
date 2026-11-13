# Narration scripts (English)

Pronunciation: ASTER "AS-ter" · CO₂ "carbon dioxide" · MMG "M M G". Target 125–140 words per minute with pauses; let the recorded voice set the final edit.

## 1. Main film — ≈ 105 s (≈ 200 words)

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

Check against the implementation: every sentence describes behaviour covered by a passing test (see `docs/CLAIM_LEDGER.md` C2–C4, C6, C7, C9). No quantitative claim is spoken.

## 2. Vertical social cut — ≈ 35 s

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

The opening question is a narrative question, not a claim that the system always separates the two.

## 3. Technical walkthrough — 3–4 min (outline with spoken lines)

1. **Version and origin.** "This is the ASTER research prototype. Everything you see is simulated data from a seeded scenario — here, scenario eleven with seed eleven, in the dark theme."
2. **Load a scenario.** "Scenarios are bundled locally. The same scenario and seed reproduce the same observations and events at any playback speed. The physiological constants are engineering assumptions, not a validated model."
3. **Three modules.** "Breathing and Exposure shows the detected inhalation windows, the measured local and cabin traces, and a per-breath estimate. Sensor Integrity shows contact force and the calibration lifecycle. Exercise shows repetitions and a comparison only when the load matches the reference sessions."
4. **Contact fault.** "Now the garment loosens. The contact measurement drops, the windows are rejected, and the exercise comparison says: not comparable — too few repetitions with valid contact. The exposure estimate continues from its own channels."
5. **Event reasoning.** "The case shows the chain: observation, quality, rule and version, evidence, and a next review step. The guidance is an illustrative workflow, not a validated procedure."
6. **Link unavailable.** "The simulated Earth link is down. The case package is queued locally and stays available."
7. **Restore and reply.** "When the link returns the package is delivered — a duplicate delivery is ignored — and the ground replies. The reply stays attached to the exact case revision; if the local case has moved on, the reply is marked as stale context."
8. **Real offline.** "Separately from the simulated link: with the network actually blocked, the provisioned app reloads, recovers the run from its command log, and keeps working. Closing the tab stops computation — this is not background monitoring."
9. **Evaluation.** "In the researcher role, the lab can overlay the simulator's hidden reference. The engine never sees it. On held-out simulated conditions the candidate exposure method had a mean absolute error of 284 parts per million, against about 1,250 for the phase-gated baseline. That is method behaviour in simulation, not clinical accuracy."
10. **Boundaries.** "Implemented: the three modules, the case workflow, store-and-forward, offline operation, seven languages. Experimental: every estimate. Unverified: any hardware — integrations are emulator-verified only."
