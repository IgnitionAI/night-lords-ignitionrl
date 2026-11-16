# Ship tactical architecture and learning evidence

## Live behavior
Live mission behavior currently uses authored tactical rules, with the earlier 32-input/8-action PPO used only for close ground movement. No new tactical model has been promoted.

Scripted safety/execution owns geometry, line of sight, limited belief, cooldowns, hit testing, collision-resolved dodge trajectories, finite overhead rails, climb/perch/drop, pose overrides and audio telegraphs. Tactical rules select search, flank, attack, cover or retreat from each hunter's belief and known mates. Reload opportunities enter through perception. Role assignment can differ between hunters when their knowledge differs; there is no omniscient squad manager.

The 16-input experimental actor observes own health, cooldowns, known target position age/range/facing, seen flag, heard reload memory, known nearby mates and public clearance. It chooses six eight-tick options: assault, left flank, right flank, cover, dodge, ceiling. Execution still enforces physical rules. No player true position is supplied to the actor.

## Actual training
Backend: src/ppo.ts, locally adapted from IgnitionAI/ignition@52974ec. PPO clipped actor/critic, shared parameters, TD bootstrap at option boundaries (not the older trainer's GAE rollouts).

Trial 1: 60 updates,17658 transitions; runs/ship-tactical. Held-out perfect-tracking encounters found less damage than rules. Rejected.
Trial 2: 400 updates,114920 transitions; runs/ship-tactical-v2. Training opponents have LOS/cone visibility,3tick reacquisition and bounded turning. Held-out36 encounters per controller: rules2 wins,4.667 average damage; learned0 wins,1.167 average damage. Learned controller spends much longer on overhead routes, with no dodges recorded. Rejected: survival/ceiling behavior is not useful pressure.

Reports: tactical-comparison-initial.json, tactical-comparison.json, tactical-comparison-v2.json. These are short combat encounters across3 opponent styles, not full missions and not human difficulty measurements. Neither learned policy is in the live game.

## Validation limits
24 focused tests cover mission state, physical route roundtrip without enemies, geometry connectivity with alternate route, partial-information actions, physical dodges, ceiling transitions and vertical hits. Procedural suspension poses were viewed on the actual refined armor in a separate lit fixture; fixture captures are not proof of an in-game ambush. Full mission FPS combat validation remains ongoing.


## Coordination correction
Initial roles now persist when contact expires. Only a remembered confirmed death removes a brother from the local roster. A corpse no longer transmits its death over vox through walls. Living mates relay a finite retreat deadline through existing perception/vox; a fresh report requests cover, with expiry. Switching modes invalidates the cached shelter target. Regression tests cover lost contact, unseen casualties, confirmed reassignment and retreat-report expiry.

A second live FPS test used the port approach without firing. It ended at tick256 with armor destroyed, all4 Night Lords alive and one interceptor physically traversing at height3. No browser errors or missing audio. The keyboard pilot drifted around a turn and did not reach its second waypoint; this is not evidence of a completed mission or balanced human difficulty. The pilot now stops movement briefly for large heading changes; that adjustment still requires validation.
