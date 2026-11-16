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
