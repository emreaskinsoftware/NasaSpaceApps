# Generation prompts for the Higgsfield connector (inserts only)

Use a video model **only** for the abstract inserts below. Do not ask it to draw the ASTER interface, charts, numbers, astronauts' faces, agency logos, mission patches or real spacecraft interiors. Product scenes come from the real capture.

Global style for every prompt: *dark graphite background (#0B1016), thin cyan (#66D5E8) and amber (#F5C36B) line work, calm precise motion, shallow depth, no text, no logos, no people's faces, no UI, 16:9, 30 fps, 4–6 seconds, seamless loopable start and end.*

| Id | Used in | Prompt | Negative prompt |
|---|---|---|---|
| A1 | Shot 2, "Environment" | Slow macro view of faint translucent gas wisps drifting and mixing in still air around a simple abstract sphere, thin cyan contour lines tracing the flow, graphite background | text, numbers, face, astronaut, logo, spacecraft, interface, chart |
| A2 | Shot 2, "Body" | Abstract thin-line waveform pulsing rhythmically like a calm breath, a second finer amber line vibrating in short bursts beneath it, both drawn as light on graphite | anatomy, organs, blood, face, text, interface |
| A3 | Shot 2, "Measurement" | Close view of a small flat flexible sensor patch on woven technical fabric that gently lifts at one edge and settles again, amber rim light on the lifting edge, graphite background | skin close-up, face, brand marks, text |
| B1 | Optional bridge before shot 8 | Two small points of light far apart on a graphite field, a thin cyan dashed line travelling slowly from one to the other, pausing midway, then completing | planets with flags, rockets, logos, text |
| C1 | Shot 10 background | Very slow drifting field of thin horizontal cyan lines on graphite, extremely subtle, suitable behind a wordmark | text, logos |

On-screen label for A3 in the edit: **"Hardware concept"** — no physical device exists.

Parameters to record in `video-manifest.json` after generation: model and version, seed, duration, resolution, prompt id, licence/terms of the generated asset.

## What must not be generated

- Any picture of the application, a dashboard, a chart or a number.
- A wearable shown on an astronaut in orbit, or anything implying flight use.
- Emergency drama: alarms, red flashing, distressed people.
