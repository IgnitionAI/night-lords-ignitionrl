# Ship expansion — work in progress

Implemented this turn:
- Mission-only 72x40 geometry; original duel geometry remains 40x24. Shared layout drives collision, LOS, BFS and visible full-height bulkheads.
- Six connected sectors, alternate routes, relocated core (67,14), Genestealers and sector signs.
- Two topology tests / 20 assertions passed, with all props and an axial passage blocked. Studio bundle builds.
- Removed fixed attack schedule from mission tactics and shooting. Authored role selection uses known living mates; attack opportunities use remembered facing, nearby known support and perceived reload. Search can fail; wounded retreat and cover positions are physical.

NOT COMPLETE:
- These tactical rules are scripted, NOT newly learned. Existing PPO is still the low-level 32-input/8-action actor. Must inspect Ignition integration, implement tactical learning, train and compare.
- Ceiling navigation, rapid dodges, animations, vertical hit testing, audio telegraphs remain.
- Catwalks/maintenance visual detail, physical route QA and full FPS mission remain.
- Existing mission/griffe tests and route evaluation contain obsolete old-map/fixed-phase assumptions: update meaningfully. Do not claim they passed.
- main.ts still exposes huntPhase diagnostics from old rhythm although actions no longer use it: replace with tacticalState. Fallback without actor still bypasses griffe: fix.
- Cover selection has one cached target/20 ticks; add role-switch invalidation if needed.
- NewWorld now places mission player at (3,12), NL in free ship spaces. Mission timer remains90sec; evaluate full escape before changing.
- No checkpoint/final delivery or publication yet. Current edits uncommitted on dev.


## Continuation: ceiling execution and first tactical PPO experiment
- Added vertical-hunt.ts: five explicit rail routes, climb/traverse/perch/drop, finite wait, bounded collision-resolved motion. Bolter height test and melee height/LOS gates added. Still needs actual rig climbing/perching pose work: current rendered body is elevated upright, NOT a validated ceiling animation. Rail/grip geometry exists but grip supports need visual polish.
- Mission hp7; dodge physical .85m/tick x3; cooldown28; no immunity. Bolter stun now1tick in mission, locomotion4.8m/s; wounded retreat after recent damage. Fist no global distant stun. Existing duel preserved.
- Browser diagnostics now tacticalState/height/vertical; no actor fallback also uses griffe.
- 22 focused tests pass including full physical mission via port passage outbound and axial return, without enemies. Not full FPS combat proof.
- PPO local Ignition-derived backend actually ran60updates/17658 tactical transitions. 16 observation inputs, 6 options, 8tick decisions, PPO clip with TD bootstrap. runs/ship-tactical/actor.json/full.json/metrics.json. New scripts train-ship-tactics.ts and eval-ship-tactics.ts.
- tfjs-node4 requires scripts/tfjs-node-compat.cjs under Node26 (removed util helper). Studio background sandbox cannot read ps for resource guard; stopped that job; reran via approved escalated exec with guards intact and completed. No live training remains.
- Held-out72 bouts (36 each) in docs/mission/tactical-comparison.json: rule damage1.667, learned.611, both0wins; perfect tracking opponent. First comparison archived initial.json. Learned candidate NOT promoted; it has weak near-uniform entropy and is worse. Need improve training/reward/encounter starts, compare reaction-limited players too, and integrate only if justified. No learned tactical actor currently used in live game.
- Still outstanding: convincing ceiling poses and attacks in real FPS; spatial audio for vertical transitions; coordination/roles stability and covered retreat; catwalk details; full combat mission validation. Do not finish Loop or claim difficulty achieved.
