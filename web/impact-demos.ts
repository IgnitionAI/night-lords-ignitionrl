// Mises en scène des clips d'impact (présentation). Le pas de sim décide encore des événements.
import { T_CFG, type TAction, type World } from '../src/sim';

export interface DemoScript {
  place(w: World): void;
  player(t: number): TAction;
  nls(t: number, w: World): number[];
}

const idle = (): TAction => ({ fwd: 0, strafe: 0, turn: 0, bolt: false, fist: false });

function park(w: World) {
  w.nls.forEach((n) => { n.alive = true; n.cd = 20; n.armTicks = 0; n.stunTicks = 0; n.hp = 1; });
}

function far(w: World) {
  w.nls[0].x = 18; w.nls[0].y = 8;
  w.nls[2].x = 18; w.nls[2].y = 16;
  w.nls[3].x = 22; w.nls[3].y = 12;
}

export const IMPACT_DEMOS: Record<string, DemoScript> = {
  'impact-combo': {
    place(w) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.vx = 0; w.t.vy = 0;
      park(w); w.nls.forEach((n) => { n.cd = 0; });
      w.nls[1].x = 8.95; w.nls[1].y = 13.12; w.nls[1].facing = Math.atan2(12 - 13.12, 8 - 8.95);
      far(w);
    },
    player: () => idle(),
    nls: (t) => [0, t === 3 ? 7 : 0, 0, 0],
  },
  'impact-leap': {
    place(w) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.vx = 0; w.t.vy = 0;
      park(w); w.nls.forEach((n) => { n.cd = 0; });
      w.nls[1].x = 12.4; w.nls[1].y = 12.05; w.nls[1].facing = Math.PI;
      far(w);
    },
    player: () => idle(),
    nls: (t) => [0, t < 4 ? 1 : t === 4 ? 7 : 0, 0, 0],
  },
  'impact-dodge-l': {
    place(w) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0;
      park(w);
      w.nls[1].x = 9.1; w.nls[1].y = 13.2; w.nls[1].facing = Math.atan2(12 - 13.2, 8 - 9.1);
      far(w);
    },
    player: () => idle(),
    nls: (t) => [0, t === 2 ? 3 : t > 2 && t < 6 ? 3 : 0, 0, 0],
  },
  'impact-dodge-r': {
    place(w) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0;
      park(w);
      w.nls[1].x = 9.1; w.nls[1].y = 13.2; w.nls[1].facing = Math.atan2(12 - 13.2, 8 - 9.1);
      far(w);
    },
    player: () => idle(),
    nls: (t) => [0, t === 2 ? 4 : t > 2 && t < 6 ? 4 : 0, 0, 0],
  },
  'impact-hit-front': {
    place(w) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.fistCd = 0; w.t.fistCharge = 0;
      park(w);
      w.nls[1].x = 8.15; w.nls[1].y = 14.55; w.nls[1].facing = -Math.PI / 2;
      w.nls[0].x = 9.55; w.nls[0].y = 12.0; w.nls[0].facing = Math.PI;
      w.nls[2].x = 16; w.nls[2].y = 8; w.nls[3].x = 18; w.nls[3].y = 16;
    },
    player: (t) => ({ ...idle(), fist: t === 3 }),
    nls: () => [0, 0, 0, 0],
  },
  'impact-hit-back': {
    place(w) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.fistCd = 0; w.t.fistCharge = 0;
      park(w);
      w.nls[1].x = 8.15; w.nls[1].y = 14.55; w.nls[1].facing = Math.PI / 2;
      w.nls[0].x = 9.55; w.nls[0].y = 12.0; w.nls[0].facing = Math.PI;
      w.nls[2].x = 16; w.nls[2].y = 8; w.nls[3].x = 18; w.nls[3].y = 16;
    },
    player: (t) => ({ ...idle(), fist: t === 3 }),
    nls: () => [0, 0, 0, 0],
  },
  'impact-hit-left': {
    place(w) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.fistCd = 0; w.t.fistCharge = 0;
      park(w);
      w.nls[1].x = 8.15; w.nls[1].y = 14.55; w.nls[1].facing = 0;
      w.nls[0].x = 9.55; w.nls[0].y = 12.0; w.nls[0].facing = Math.PI;
      w.nls[2].x = 16; w.nls[2].y = 8; w.nls[3].x = 18; w.nls[3].y = 16;
    },
    player: (t) => ({ ...idle(), fist: t === 3 }),
    nls: () => [0, 0, 0, 0],
  },
  'impact-hit-right': {
    place(w) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.fistCd = 0; w.t.fistCharge = 0;
      park(w);
      w.nls[1].x = 8.15; w.nls[1].y = 14.55; w.nls[1].facing = Math.PI;
      w.nls[0].x = 9.55; w.nls[0].y = 12.0; w.nls[0].facing = Math.PI;
      w.nls[2].x = 16; w.nls[2].y = 8; w.nls[3].x = 18; w.nls[3].y = 16;
    },
    player: (t) => ({ ...idle(), fist: t === 3 }),
    nls: () => [0, 0, 0, 0],
  },
  'impact-stagger': {
    place(w) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.ammo = T_CFG.boltAmmo; w.t.boltCd = 0;
      park(w);
      w.nls[0].x = 10.05; w.nls[0].y = 12.12; w.nls[0].facing = Math.PI;
      w.nls[1].x = 18; w.nls[1].y = 8; w.nls[2].x = 18; w.nls[2].y = 16; w.nls[3].x = 20; w.nls[3].y = 12;
    },
    player: (t) => ({ ...idle(), bolt: t === 4 }),
    nls: () => [0, 0, 0, 0],
  },
  'impact-death-throw': {
    place(w) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.ammo = T_CFG.boltAmmo; w.t.boltCd = 0;
      park(w);
      w.nls[0].x = 10.05; w.nls[0].y = 12.12; w.nls[0].facing = Math.PI;
      w.nls[1].x = 18; w.nls[1].y = 8; w.nls[2].x = 18; w.nls[2].y = 16; w.nls[3].x = 20; w.nls[3].y = 12;
    },
    player: (t) => ({ ...idle(), bolt: t === 4 }),
    nls: () => [0, 0, 0, 0],
  },
  'impact-death-collapse': {
    place(w) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.fistCd = 0; w.t.fistCharge = 0;
      park(w);
      w.nls[0].x = 9.55; w.nls[0].y = 12.0; w.nls[0].facing = Math.PI;
      w.nls[1].x = 16; w.nls[1].y = 8; w.nls[2].x = 16; w.nls[2].y = 16; w.nls[3].x = 20; w.nls[3].y = 12;
    },
    player: (t) => ({ ...idle(), fist: t === 3 }),
    nls: () => [0, 0, 0, 0],
  },
  'impact-death-dismember': {
    place(w) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.fistCd = 0; w.t.fistCharge = 0;
      park(w);
      w.nls[1].x = 9.55; w.nls[1].y = 12.05; w.nls[1].facing = Math.PI;
      w.nls[0].x = 16; w.nls[0].y = 8; w.nls[2].x = 16; w.nls[2].y = 16; w.nls[3].x = 20; w.nls[3].y = 12;
    },
    player: (t) => ({ ...idle(), fist: t === 3 }),
    nls: () => [0, 0, 0, 0],
  },
  'impact-term-recoil': {
    place(w) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.ammo = T_CFG.boltAmmo; w.t.boltCd = 0;
      park(w);
      w.nls[0].x = 14; w.nls[0].y = 12.15; w.nls[0].facing = Math.PI;
      far(w);
    },
    player: (t) => ({ ...idle(), bolt: t === 3 }),
    nls: () => [0, 0, 0, 0],
  },
  'impact-term-fist': {
    place(w) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0; w.t.fistCd = 0; w.t.fistCharge = 0;
      park(w);
      w.nls[0].x = 9.6; w.nls[0].y = 12.0; w.nls[0].facing = Math.PI;
      w.nls[1].x = 8.2; w.nls[1].y = 14.4; w.nls[1].facing = -Math.PI / 2;
      w.nls[2].x = 16; w.nls[2].y = 8; w.nls[3].x = 18; w.nls[3].y = 16;
    },
    player: (t) => ({ ...idle(), fist: t === 3 }),
    nls: () => [0, 0, 0, 0],
  },
  'impact-term-hit': {
    place(w) {
      w.t.x = 8; w.t.y = 12; w.t.facing = 0;
      park(w); w.nls.forEach((n) => { n.cd = 0; });
      w.nls[1].x = 8.5; w.nls[1].y = 13.48; w.nls[1].facing = Math.atan2(12 - 13.48, 8 - 8.5);
      far(w);
    },
    player: () => idle(),
    nls: (t) => [0, t === 2 ? 7 : 0, 0, 0],
  },
  'impact-term-walk': {
    place(w) {
      w.t.x = 6; w.t.y = 12; w.t.facing = 0; w.t.vx = T_CFG.fwd; w.t.vy = 0;
      park(w); far(w);
    },
    player: () => ({ fwd: 1, strafe: 0, turn: 0, bolt: false, fist: false }),
    nls: () => [0, 0, 0, 0],
  },
};
