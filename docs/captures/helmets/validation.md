# Night Lord helmet replacement

Four metre-scaled, head-bone-mounted helmets with blue armour, red optics, a metal respirator and crimson scalloped bat fins. Original head-weighted faces are removed from cloned runtime geometry; neck-weighted crest remnants are removed only inside the helmet region. Source GLBs remain intact.

Validation: browser harness loads all four actual GLBs and samples their bundled animation at 0.2, 0.5 and 0.8 seconds. Attachment error and removed face counts are recorded in check.json. Lineup and motion captures show the actual assembled models; duel.png shows the FPS view. Live preview console reported no errors. Camera/duel regression suite: 21 pass, 0 fail. Vite production build passed (existing chunk-size advisory).

Scope: helmet presentation only. Combat, player visor, bodies, weapons and audio source code unchanged. No publication.
