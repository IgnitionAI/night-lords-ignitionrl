# FPS motion revision

## Baseline — 2026-11-17

- Real player camera recordings: `before/duel.webm`, `before/mission.webm`, seed 527. `scripts/capture-fps-motion.ts` records keyboard input and state; no simulation overrides. The stationary duel player dies at tick 44; later frames are not evidence of live actions.
- Labelled deterministic visual fixture: `before/lab.mp4` and its timed frames/trace. Fixed FPS camera, current game renderer/armor/animation stack; scripted movement/events, not a gameplay test. Idle, approach, left/right movement, retreat, stop, preparation/attack, hit and shooting.
- Both recordings had no page exceptions.
- Observed faults: abrupt body roll during dodge, repeated full-body dodge on ordinary side/back movement, pose collapse from running to idle/attack, feet lifted disproportionately while running. Existing full-body slash also moves the body off its stance.
- Measurements on the refined armor: head ~1.57–1.64 m in run, ~1.30–1.31 m idle, ~1.12–1.19 m slash; run ankle can rise above 1.2 m. These are incompatible source rest poses, not a gameplay speed problem.
- The old gait calibration treats one foot sweep as the distance of a complete two-step cycle. Forward clips also play unchanged while the entity moves sideways/backwards.

Scope: visual presentation of existing FPS hunters only. Preserve simulation, character models, equipment, audio, menus/locales, policy and mission rules.
