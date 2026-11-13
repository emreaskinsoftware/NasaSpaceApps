# ASTER — Space Health Research Console

## Document status

- Date: 13 November 2026.
- Status: product specification and research concept; no implementation or validation is implied.
- Working name: ASTER. This is a provisional product name, not a claim of name availability.
- Delivery strategy: simulation first, with an architecture that accepts recorded and future hardware data.
- Intended implementation agent: Claude Fable 5.2 in a development environment with filesystem, terminal, browser, and Git access.
- Target repository: https://github.com/umitcancinar/NasaSpaceApps
- Challenge supplied by the team: Create Health Monitoring Software for Astronauts on Space Missions, NASA Space Apps Challenge, Malatya. Verify current official requirements before submission; the supplied challenge page returned an error during this research session.
- Language: all project documents, README, presentation, narration, and public release material must be English. The application defaults to English and additionally supports the locales defined in the build specification.

## 1. Executive description

ASTER is an offline-capable astronaut health research application that connects environmental exposure, physiological response, and measurement reliability in one explainable workflow. Its first release is a working simulation and replay product, not a clinically validated medical device.

It contains three connected research modules:

1. **Breathing & Exposure:** estimate inhalation-phase carbon dioxide exposure from appropriately timed local gas and respiratory measurements, while exposing uncertainty caused by sensor dynamics and sampling location.
2. **Sensor Integrity:** investigate whether a known mechanical reference excitation and contact measurements can distinguish changes in sensor coupling from changes in a physiological signal.
3. **Exercise & Muscle Response:** compare muscle-response features during matched exercise conditions while accounting for signal quality, movement, and fluid-sensitive impedance measurements.

A local, deterministic decision engine turns valid observations into evidence-linked research events. A separate communication service queues those events, transfers them through an explicitly modeled delayed or interrupted link, and associates ground-team replies with the correct event revision.

The product is built around a question: **What changed, how trustworthy is the measurement, and what evidence supports the next step?**

## 2. The problem and intended contribution

Spaceflight health monitoring is not an empty field. Smart garments, mechanical cardiac sensing, personal gas monitors, integrated data platforms, and asynchronous medical communication already exist or are under development. ASTER must acknowledge them rather than claiming to invent these categories.

The contribution being investigated is narrower: extracting more defensible interpretations when a measurement is affected by its environment, its attachment to the body, or another physiological process. The software must expose those dependencies and evaluate candidate methods against meaningful baselines.

Examples of the ambiguity:

- A nearby CO2 sensor reading does not necessarily equal the concentration inhaled during a breath.
- A smaller mechanical waveform can result from changed sensor attachment, not necessarily reduced physiological activity.
- An impedance change can be affected by fluid redistribution, exercise, movement, or contact; it is not automatically evidence of muscle loss.
- A delayed ground response may refer to an earlier state and cannot silently replace the current assessment.

These are distinct problems. Their integration is useful, but integration alone is not proof of novelty. Each experimental method needs its own comparator, outcome, and limitation statement.

## 3. Evidence and prior art

Use the full source ledger in `05_RESEARCH_AND_TECHNOLOGY_SOURCES.md`.

| Existing work | What it establishes | Consequence for ASTER |
|---|---|---|
| CSA Bio-Monitor and Space Health/Artemis [S01, S02] | Smart garments and analysis of astronaut physiological data are established research directions. | Do not claim the first astronaut smart shirt or first AI health dashboard. |
| MagIC-Space [S03] | A sensorized garment recorded ECG, respiration, and mechanical cardiac activity during ISS sleep recordings. | Do not claim first cardiac vibration sensing in space. |
| NASA personal CO2 monitoring [S04, S05] | Wearable local environmental monitoring has been tested; the cited risk record distinguishes local concentrations from inspired levels. | The candidate target is exposure interpretation under measurement constraints, not merely adding a gas sensor. |
| NASA inspired CO2 methodology [S06] | Respiratory-cycle averaging and rebreathing-related waveform issues have been studied. | Simple respiratory gating is prior art; investigate robustness, sampling delay, and reduced equipment burden. |
| PVDF ECG/SCG e-tattoo [S07] | Flexible mechanical sensing and paired-sensor artifact reduction are established. | Benchmark against a reasonable paired-sensor method, not only unfiltered data. |
| Wearable mechano-acoustic elastography [S08] | Controlled mechanical excitation and wearable sensing are physically feasible. | This supports a hardware concept, not validation of physiological signal correction. |
| MMG reliability research [S09] | Attachment and acquisition conditions affect measurement repeatability. | Model coupling and report valid coverage rather than hiding rejected data. |
| Bioimpedance and fluid-shift studies [S10, S11, S12] | Impedance contains information related to fluid distribution; movement and physiological interpretation remain important. | Do not directly convert a signal into a definitive diagnosis or absolute tissue loss. |
| NASA muscle-risk and exercise work [S13, S14] | Countermeasure effectiveness and exercise monitoring matter; exercise pose monitoring is not new. | Tie exercise analysis to matched load and interpretable uncertainty. |
| NASA CHP-IDSP and xEHR [S15, S16] | Integration and asynchronous support are established development objectives. | Treat offline operation and communication as product infrastructure, not the principal invention. |

Evidence of a published concept does not mean every vehicle operates a completed equivalent. Conversely, a search that finds no identical product does not establish novelty, patentability, or clinical effectiveness.

## 4. Users and roles

### Crew member

Needs a quiet, readable overview of current observations, measurement problems, and relevant guidance. The product must not depend on daily diaries, symptom narration, or special cognitive tests to produce routine monitoring data. An optional acknowledgement is an operational interaction, not a prerequisite for inference.

### Crew medical officer

Needs an event timeline, signal windows, alternative explanations, data-quality status, and source-linked procedures. This role can review and acknowledge an event but does not turn a prototype into an autonomous treatment system.

### Ground specialist

Needs a compact case package, revision history, missing-evidence requests, and a reply mechanism. In the first release this is a functional ground console used by an operator or an explicitly labeled simulated responder, not a live NASA service.

### Researcher or judge

Needs reproducible scenarios, hidden simulator truth, method comparisons, exports, and a clear distinction between observations, estimates, and unsupported claims.

## 5. Shared operating model

Every observation carries origin, timestamp, unit, quality, and provenance. Every estimate carries its method/version and the input interval it used. Every event carries its triggering rule, evidence, uncertainty, and revision.

Each execution has an immutable run identity. Historical replay does not modify communicated evidence. Resetting or branching from a past point creates a new run; replies and acknowledgements remain attached to their original run and event revision. Simulated inference and communication share a virtual clock, while actual acquisition and transport use wall time.

Three independent labels must remain visible:

- **Source:** simulated, recorded, hardware, or mixed.
- **Measurement state:** valid, suspect, invalid, stale, or unavailable.
- **Interpretation status:** descriptive observation, experimental estimate, or research guidance.

Never compress these into a single green/red status. A sensor can be connected but unreliable. A reliable measured concentration can still support only an uncertain exposure estimate.

The engine runs locally from structured data and versioned rules. It does not need a hosted LLM. A language model must not invent clinical thresholds or treatment instructions. There is no automatic medication dosing, diagnosis, or control of life-support hardware in the release.

## 6. Module A: Breathing & Exposure

### Research objective

Evaluate whether synchronization, respiratory phase information, and a sensor-dynamics model improve inhalation-phase concentration estimation relative to simpler methods under stated conditions.

### Inputs

- Respiratory waveform or phase estimate, with phase uncertainty.
- Near-face gas concentration, sampling location, sensor response characteristics, and sampling-line delay where applicable.
- Cabin CO2 and pressure; optional temperature, humidity, head movement, and location context.
- Optional calibrated respiratory flow. This is not assumed to exist.

### Outputs

- Measured cabin and local CO2 traces, separately labeled.
- Inhalation windows and an experimental inhalation-phase mean CO2 estimate.
- Estimate coverage, lag estimate, sensor quality, and assumptions.
- Concentration-time exposure history, explicitly labeled as such.
- A time-aligned evidence package when a configured research criterion is met.

### Scientific constraints

With a known inhalation interval but no flow measurement, a time-weighted concentration average is not a volume-weighted inhaled dose. Do not label it as dose, blood CO2, end-tidal CO2, hypercapnia diagnosis, or oxygen saturation.

A PVDF respiration waveform may support phase estimation after validation; it does not automatically provide calibrated airflow or tidal volume. Sampling near the face does not prove that the sampled gas equals the gas entering the airway. A slow sensor cannot recover arbitrarily fast changes through software.

Do not discard every exhalation-related peak as contamination: re-inhalation can be the phenomenon of interest. A proposed correction must preserve genuine rebreathing effects.

### Demonstration

Run matched cabin traces with different near-face mixing and respiratory timing. Compare the candidate estimate against a simulator reference held outside the decision engine. Show a failure case with insufficient bandwidth or severe phase uncertainty; the correct product response may be to withhold the estimate.

### Success measures

Concentration-estimation error, valid-breath coverage, lag sensitivity, false event rate, missed event rate, and performance on held-out sensor dynamics. Numeric success claims require measured results, a defined reference, and the scenario distribution.

## 7. Module B: Sensor Integrity

### Research objective

Evaluate whether a mechanical reference response, contact measurement, and motion reference help identify or compensate coupling changes in a mechanical biosignal.

### Proposed future hardware

PVDF or an equivalent mechanical sensor, a controlled low-amplitude actuator, an inertial reference, and a contact-force/pressure measurement. The simulation models these components; it does not claim to manufacture them.

### Outputs

- Raw, baseline-processed, and candidate-processed waveforms.
- Contact state and transfer-response features.
- Calibration lifecycle: not available, scheduled, active, evaluating, accepted, rejected, expired.
- Explicit invalid windows during excitation or failed correction.
- Feature error and valid coverage where an independent reference is available.

### Scientific constraints

The path of an injected mechanical wave can differ from the path of a cardiac or muscular signal. Therefore a successful self-check does not establish physiological calibration. The estimator must be tested under transfer-function mismatch and actual physiological change; it must not normalize away a meaningful change in the body.

Calibration is an instrument operation, not an astronaut task. It must not be presented as permanently passive sensing in a technical report: the instrument uses active mechanical excitation even though the wearer need not act.

### Demonstration

Replay the same latent physiological source through different coupling states. Compare fixed filtering, paired-sensor artifact reduction, and the candidate method. Also change the latent source while keeping attachment fixed, then change both. The algorithm should distinguish what it can and explicitly abstain where it cannot.

### Success measures

False physiological-event rate during coupling faults, sensitivity to real source changes, accepted-window feature error, coverage, calibration overhead, and compute/energy estimates where supported.

## 8. Module C: Exercise & Muscle Response

### Research objective

Track changes in muscle-response features during comparable routine exercise while controlling for acquisition quality, motion, external load, and fluid-sensitive measurements.

### Inputs

- External force or resistance and movement/position data.
- MMG waveform from PVDF or another mechanical sensor.
- Optional surface EMG or a reference force measurement for evaluation.
- Complex impedance measurements at declared frequencies and electrode geometry.
- Contact state, skin temperature if available, activity context, and personal reference sessions.

### Outputs

- Session timeline, repetitions, load, cadence, and matched comparison segments.
- MMG feature changes and within-person reference differences.
- Impedance trends and relevant caveats, not an invented fluid volume.
- An experimental response-deviation indicator only when required inputs are valid.
- Recovery trend where an appropriate observation window exists.
- A summary showing which sessions are and are not comparable.

### Scientific constraints

Do not claim that MMG amplitude is a direct measurement of force, that an impedance change proves dehydration, or that a short recording proves muscle atrophy. No universal muscle-health percentage or failure prediction may appear without validation. Camera pose alone cannot establish external load. Observational changes do not prove that an exercise countermeasure caused an improvement.

The first release investigates feature interpretation and confounding. Proving long-term preservation of muscle function requires a different study.

### Demonstration

Create scenarios with matched load and different response, different load and stable response, fluid-sensitive impedance shifts, contact slip, and combined confounding. The system should avoid comparing unmatched exercise segments and should expose uncertainty rather than inventing a diagnosis.

## 9. Cross-module behavior

The integrity module informs whether the respiratory or muscle channels can be used. An invalid MMG channel prevents a confident muscle-response estimate but does not suppress a valid environmental gas alert. Missing near-face CO2 prevents an inspired-exposure estimate but leaves the cabin observation available.

Example sequence:

1. A synthetic crew member begins routine exercise.
2. The local respiratory signal accelerates; the cabin and local gas readings diverge.
3. The garment loosens and the MMG response changes.
4. ASTER records a contact-quality event and withholds the affected muscle interpretation.
5. The exposure module continues from its independently valid channels.
6. The research guidance card explains the event and points to its evidence/procedure status.
7. The Earth link is unavailable, so the case remains locally accessible and enters a persistent queue.
8. After delivery, a ground reply refers to the exact case revision; a newer local state is shown alongside it.

This sequence is a demonstration of implemented software behavior, not evidence of clinical benefit.

## 10. Product modes

- **Overview:** selected crew member, current evidence, relevant trends, and prioritized events.
- **Breathing & Exposure:** synchronized respiratory/environmental interpretation.
- **Exercise:** routine-session tracking and matched comparison.
- **Sensor Integrity:** quality, calibration, and device status.
- **Cases:** event chronology, reasoning, acknowledgements, and exports.
- **Ground Console:** received cases, requests, and replies.
- **Simulation Lab:** scenario configuration, playback, fault injection, and hidden-truth evaluation.
- **Devices & Integrations:** adapters, capabilities, permissions, and connection health.
- **Evidence Library:** research references, method cards, rule cards, and limitations.
- **Settings:** language, theme, units, motion, retention, and local privacy controls.

Simulation and hardware are data origins, not visual themes. All clinical-looking views must identify simulated or mixed-origin data persistently.

## 11. Offline and communication scope

Two supported execution profiles are required:

1. **Browser demo:** installed/cached PWA, worker-based simulator and analysis, IndexedDB storage, local simulated ground console. It runs after provisioning without external network requests. Browser closure or OS suspension stops browser computation; do not imply background medical monitoring.
2. **Local mission workstation:** a local service hosts the application, acquisition, processing, durable storage, and optional network transport. It continues while its process is running, even if the UI tab closes. Power loss or service shutdown still stops acquisition.

No network login, CDN, remote fonts, hosted AI, analytics, or licensing call may be necessary for the offline demo. A first installation still requires provisioning of software and assets.

Earth communication means an application-level store-and-forward workflow over a configured transport. It is not an implementation of NASA radio infrastructure or automatically a standards-compliant DTN stack. Reducing message size or follow-up rounds does not reduce physical propagation delay.

## 12. Presentation and design intent

The visual identity should feel like a precision research instrument: calm, deliberate, and legible. Professionalism comes from hierarchy, trustworthy state, polished interaction, and complete workflows. Avoid decorative sci-fi elements that compete with the evidence.

Use carefully choreographed transitions in navigation, event inspection, and replay. Keep raw signal geometry faithful. Do not tween measured values through invented intermediate physiological states. Respect reduced motion, keyboard operation, contrast, and localization.

The product must have equally considered light and dark themes. All core workflows must be usable in the specified seven locales. The English presentation and video must use the actual shipped interface and authentic results.

## 13. Claims policy

Allowed before validation:

- “A simulation-first research prototype for offline, evidence-linked space health monitoring.”
- “Investigates breathing-phase exposure estimation, sensor coupling, and matched exercise response.”
- “Supports reproducible comparison of candidate methods under simulated faults.”

Allowed only after the relevant check:

- “Runs offline after provisioning.”
- “Persists and resends case packages across interrupted connections.”
- “Reduced error by X under scenario set Y relative to baseline Z.”
- “Received telemetry from device/protocol X,” with an actual integration record.

Not allowed without substantially different evidence:

- NASA-approved, flight-ready, clinically validated, patented, first-ever, or guaranteed award-winning.
- Detects SANS, measures intracranial pressure, diagnoses hypercapnia, predicts muscle atrophy, or autonomously treats astronauts.
- Real astronaut telemetry when the data are synthetic or terrestrial.
- Claims that the team has reduced Mars communication propagation latency.

## 14. Release outcomes

The completed product should include working software, reproducible simulation, baseline comparisons, honest limitations, offline installation instructions, adapter contracts and a working reference producer, a complete English README, an editable English presentation with PDF export, and a narrated English video recorded from the real product.

It is acceptable for a hypothesis to perform worse than a baseline. It is not acceptable to hide that result or replace it with scripted success. The product's ability to reveal limits is part of its research value.

## 15. Scope and approach decision

The team selected simulation-first delivery. Hardware-first delivery was considered but would make broad product completion depend on equipment and physical validation. A presentation-only mockup was rejected because it would not demonstrate functioning inference, replay, or communication.

All three modules are in scope. They should be implemented as successive vertical slices with separate verification, then integrated. Additional disease classifiers, facial emotion inference, automated treatment, and custom sensor manufacturing are outside this release.

Open dependencies are explicitly bounded: hardware availability determines which physical adapters can be verified; voice-service access determines narration production; authenticated repository access determines publication. These dependencies do not prevent the local simulator, documentation, capture workflow, or adapter emulator from being completed.
