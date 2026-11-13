# ASTER — Speaker notes

## ASTER_Product_Overview

### 1. Space health monitoring, with the evidence in view.

ASTER is a simulation-first research prototype, not a clinically validated or flight-qualified system. Everything on screen in this deck is the shipped application running seeded synthetic scenarios. The question it is built around: what changed, how trustworthy is the measurement, and what evidence supports the next step?

### 2. A measurement can change for different reasons

One crew-day story: during routine exercise the local gas context changes, then the garment loosens. Each trace changes — for a different reason. Existing systems do consider context; our point is narrower: make these dependencies explicit and testable.

### 3. Build on what already exists

We do not claim the first smart shirt, the first gas monitor, or the first health dashboard. Respiratory gating is prior art (S06). The candidate contribution is a set of interpretation methods with explicit abstention, and an evaluation workflow with hidden truth and baselines. Sources: S01–S06, S15–S16.

### 4. Three research questions, one workflow

Three separate hypotheses share one observation and event pipeline. Integration is infrastructure, not proof of novelty: each method has its own comparator and limitation. There is no universal health score anywhere in the product.

### 5. Align the gas measurement with the breath

NASA's CO₂ risk record distinguishes personal measurements from inspired levels (S05). The estimate is a time-weighted concentration over the delay-shifted inhalation window. Without a flow signal it is not an inhaled dose. Respiratory gating itself is prior art (S06); what we test is robustness to sampling delay and sensor response, and honest abstention.

### 6. Check the measurement connection before interpreting the change

A known mechanical excitation plus a contact measurement decide whether a window may be interpreted. The actuator path can differ from the physiological path, so a passed self-check is not a physiological calibration. In the path-mismatch scenario the correction is rejected. The hardware arrangement is a concept modelled in simulation. Sources: S07–S09.

### 7. Compare like with like

The prototype does not diagnose atrophy or prove exercise efficacy. It shows a within-person deviation only for matched sessions with valid repetitions; otherwise it says "not comparable" and why. Sources: S10–S14.

### 8. One event, an inspectable explanation

This is the real case view for the contact event in the combined scenario. While the muscle interpretation is withheld, the independently valid exposure event stays open. Guidance is labelled as an illustrative, non-validated workflow.

### 9. Keep the case available when the link is not

The link is an application-level store-and-forward model on a virtual clock, shown accelerated. S15 and S16 establish the context; the implementation claim rests on our own transport tests, including a real HTTP exchange between separate gateway and ground processes.

### 10. A simulator that does not give the engine the answer

The engine package imports contracts only; a lint rule and a unit test enforce it. Held-out runs change the sensor dynamics, including a second response stage the estimator does not model. Three adversarial scenarios: slow gas sensor, calibration-path mismatch, load mismatch. Synthetic success is not clinical evidence.

### 11. What the implementation demonstrates

Every row is an executed test or the frozen evaluation report. Negative results are kept: gain compensation leaves a systematic error under path mismatch, paired-reference cancellation did not help in coupling faults, and a fluid shift alone still produced a false deviation event in some runs.

### 12. Designed for real use

Offline reload is verified with the network blocked. Automated accessibility checks pass on every route in both themes. All integrations are emulator-verified only; none is hardware-verified, and Bluetooth is not implemented.

### 13. What remains to be proven

Software verification is not physiological validation. The three key risks map to the three modules. We claim no regulatory pathway and no validation schedule.

### 14. Space health monitoring, with the evidence in view.

We invite evaluation of the working prototype: load a scenario, inject a fault, inspect the case, read the validation report. No award, invitation or endorsement is implied.

### 15. Appendix A — Data and architecture

Contracts are zod schemas validated at every boundary. The same runtime runs in a browser worker and in the local gateway. A run is recoverable from its spec and command log because simulation and communication share one virtual clock.

### 16. Appendix B — Method comparison details

Coverage must be read with error: the gate is accurate by rejecting data. Compensation recovers coverage but is biased when the actuator and physiological paths scale differently, so it is shown as experimental only.

### 17. Appendix C — Sources and claims

Full ledger: docs/CLAIM_LEDGER.md. Sources S01–S20 with boundaries are bundled in the Evidence Library. All screenshots come from the captured build listed in the asset manifest. NASA material is cited as attribution, not endorsement.

## ASTER_Short_Pitch (seven-slide short pitch: slides 1, 2, 4, combined 5–7, 8, combined 10–11, 14 of the main deck)

### 1. Space health monitoring, with the evidence in view.

ASTER is a simulation-first research prototype, not a clinically validated or flight-qualified system. Everything on screen in this deck is the shipped application running seeded synthetic scenarios. The question it is built around: what changed, how trustworthy is the measurement, and what evidence supports the next step?

### 2. A measurement can change for different reasons

One crew-day story: during routine exercise the local gas context changes, then the garment loosens. Each trace changes — for a different reason. Existing systems do consider context; our point is narrower: make these dependencies explicit and testable.

### 3. Three research questions, one workflow

Three separate hypotheses share one observation and event pipeline. Integration is infrastructure, not proof of novelty: each method has its own comparator and limitation. There is no universal health score anywhere in the product.

### 4. Three modules, each with a stated limit

Short-pitch module slide combining slides 5–7. Prototype label stays visible; limitations are stated in narration.

### 5. One event, an inspectable explanation

This is the real case view for the contact event in the combined scenario. While the muscle interpretation is withheld, the independently valid exposure event stays open. Guidance is labelled as an illustrative, non-validated workflow.

### 6. Hidden truth, baselines, and what the release demonstrates

Short-pitch evidence slide combining slides 10–11.

### 7. Space health monitoring, with the evidence in view.

We invite evaluation of the working prototype: load a scenario, inject a fault, inspect the case, read the validation report. No award, invitation or endorsement is implied.

