# Ship tactical architecture and learning evidence

## Live behavior
Live mission behavior currently uses authored tactical rules, with the earlier 32-input/8-action PPO used only for close ground movement. No new tactical model has been promoted.

Scripted safety/execution owns geometry, line of sight, limited belief, cooldowns, hit testing, collision-resolved dodge trajectories, finite overhead rails, climb/perch/drop, pose overrides and audio telegraphs. Tactical rules select search, flank, attack, cover or retreat from each hunter's belief and known mates. Reload opportunities enter through perception. Role assignment can differ between hunters when their knowledge differs; there is no omniscient squad manager.

The 16-input experimental actor observes own health, cooldowns, known target position age/range/facing, seen flag, heard reload memory, known nearby mates and public clearance. It chooses seven eight-tick options: assault, left flank, right flank, cover, dodge, ceiling, synchronize. Trials1/2 used the original six; trial3 adds synchronize. Execution still enforces physical rules. No player true position is supplied to the actor.

## Actual training
Backend: src/ppo.ts, locally adapted from IgnitionAI/ignition@52974ec. PPO clipped actor/critic, shared parameters, TD bootstrap at option boundaries (not the older trainer's GAE rollouts).

Trial 1: 60 updates,17658 transitions; runs/ship-tactical. Held-out perfect-tracking encounters found less damage than rules. Rejected.
Trial 2: 400 updates,114920 transitions; runs/ship-tactical-v2. Training opponents have LOS/cone visibility,3tick reacquisition and bounded turning. Held-out36 encounters per controller: rules2 wins,4.667 average damage; learned0 wins,1.167 average damage. Learned controller spends much longer on overhead routes, with no dodges recorded. Rejected: survival/ceiling behavior is not useful pressure.

Reports: tactical-comparison-initial.json, tactical-comparison.json, tactical-comparison-v2.json. These are short combat encounters across3 opponent styles, not full missions and not human difficulty measurements. Neither learned policy is in the live game.

## Validation limits
29 focused tests cover mission state, physical route roundtrip without enemies, geometry connectivity with alternate route, partial-information actions, physical dodges, ceiling transitions and vertical hits. Procedural suspension poses were viewed on the actual refined armor in a separate lit fixture; fixture captures are not proof of an in-game ambush. A full mission was completed in the live FPS renderer through normal keyboard and mouse-look inputs; see VALIDATION-VAISSEAU.md.


## Coordination correction
Initial roles now persist when contact expires. Only a remembered confirmed death removes a brother from the local roster. A corpse no longer transmits its death over vox through walls. Living mates relay a finite retreat deadline through existing perception/vox; a fresh report requests cover, with expiry. Switching modes invalidates the cached shelter target. Regression tests cover lost contact, unseen casualties, confirmed reassignment and retreat-report expiry.

A second live FPS test used the port approach without firing. It ended at tick256 with armor destroyed, all4 Night Lords alive and one interceptor physically traversing at height3. No browser errors or missing audio. The keyboard pilot drifted around a turn and did not reach its second waypoint; this is not evidence of a completed mission or balanced human difficulty. The pilot now stops movement briefly for large heading changes; that adjustment still requires validation.


## Third training trial and final-layout comparison
Trial3 completed120 updates and33974 transitions, outputs runs/ship-tactical-v3. Synchronization is now an explicit seventh option; sampling/log-prob indexing uses the action count rather than a literal6. A scripted rendezvous lasts at most12 ticks, has a45-tick retry interval, and yields to a perceived opening. Test coverage verifies expiry and interruption.

On the final layout with coolant wells and machine cover,36 held-out episodes per controller (same12 seeds x3 bounded-reaction opponent styles): scripted1 win,4.333 mean damage; learned0 wins,1.278 mean damage. Learned overhead time remained excessive (155.97 actor-ticks versus6.81); no dodges recorded. Rejected, no promotion. Source: tactical-comparison-v3-final-layout.json. These encounter results do not measure human difficulty or full mission completion.

Legacy32-input mission observations no longer read current hidden player armor or beacon-channel state; armor is retained only from an acquired visual/vox observation. Landing recovery suppresses movement, claws and shooting for4 ticks without immunity. Height-separated hunters no longer push each other sideways. Blocked overhead traversal times out into a physical descent.

The coolant room has two fenced sumps with actual floor openings, a grated bridge at normal deck height, and physical machine cover. Collision prisms and rendered dimensions share src/ship-fittings.ts. Low sump fencing does not hide a standing actor; conservative ground collision prevents entry. This is a service bridge over recessed equipment, not a second playable floor.


## Completed FPS route
The accelerated local browser completed seed527 using ordinary movement, aiming, bolter/fist and E holds: core armed40 ticks, extraction20 ticks, victory at tick555 with22 armor and68.4 seconds remaining. No health, position or enemy-state mutations were used. The observer used public geometry, a limited visible target cone/LOS, short target memory and damage reaction. This deterministic automated player is not a human-difficulty measure. Evidence: docs/captures/ship-route-gpu/check.json and sequence.json.

Equipped in-game vertical fixtures (explicitly labelled MISE EN SCENE) capture climb, traversal, drop and landing through the real simulation; they do not count as mission completion. The revised drop stops1.35m short of its remembered target instead of landing at the player's center. A separate test verifies a rear drop followed by a ground strike after recovery. Evidence: docs/captures/ceiling-in-game/frames.json.

The historical-build comparison uses archived source from d5c05b2, not a reconstructed imitation. Across36 encounters per version: old0 wins and0.167 mean damage; current1 win and4.111 mean damage. Geometry, durability and tactics all changed, so this measures the total build rather than isolating learning. Three sectors and three bounded-reaction player styles; no objectives or Genestealers in these encounter batches. Evidence: before-after-builds.json.

Second FPS route via port access waypoints completed at tick729,28 armor,61 seconds remaining. All four hunters and six Genestealers killed; no browser errors or missing audio. Navigation can use connecting corridors around obstacles, so the waypoint label does not imply exclusive use of the port corridor. Evidence: docs/captures/ship-route-gpu-port/check.json, sequence.json and outcome.png.
