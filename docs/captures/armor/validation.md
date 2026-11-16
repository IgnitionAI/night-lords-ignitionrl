# Refined Night Lord armor

New generated sculpt: 82,375 triangles, 4096x4096 base color with normal and metal/roughness textures. Generation and original delivered GLB hash are recorded in provenance.json. The runtime uses the complete sculpt including helmet, replacing the earlier procedural helmet and noisy body. Four independent skeletons share geometry and textures through SkeletonUtils cloning; materials are cloned per actor. Paint roughness has a 0.48 floor.

Existing animation clips are retargeted by rest quaternion correction; limb translations use target lengths and pelvis displacement is scaled. Four original walk clips produce 44 retargeted tracks each. The browser harness captured t=0.2,0.5,0.8 walking and t=0.05,0.15,0.25 procedural claw attack, full body, close detail, and the FPS scene. No browser page errors. Live preview accepted entry, firing three rounds (30 to 27), and pause, with no tool-reported failures.

Validation: 22 tests pass for retargeting, duel and camera; Vite production build succeeds with the existing bundle-size advisory. Protected gameplay, weapons, audio and visor sources retain their before hashes (protected-after.json). No publishing.

The new armor uses about 40.6 MB on disk and increases GPU geometry/texture cost. Geometry and textures are shared among the four characters; only one enemy is visible in the FPS duel. Visual motion checks are sampled poses, not exhaustive testing of every animation transition.
