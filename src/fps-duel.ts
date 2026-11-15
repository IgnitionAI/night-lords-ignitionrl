import { angNorm, los, nlFrame, rayFree, type World } from './sim';

/** Duel controller, not the trained four-agent policy. Uses visible state only. */
export function eliteDuelAction(w: World, i: number): number {
  const n = w.nls[i];
  if (!n.alive) return 0;
  if ((n.burstTicks ?? 0) > 0) n.burstTicks!--;
  if ((n.burstRest ?? 0) > 0) n.burstRest!--;
  const visible = los(n.x, n.y, w.t.x, w.t.y, w.propSolids);
  if (visible) { n.belief.valid = true; n.belief.x = w.t.x; n.belief.y = w.t.y; }
  const f = nlFrame(n), d = f.d;
  if ((n.recoveryTicks ?? 0) > 0 || n.stunTicks || n.armTicks || (n.shotTicks ?? 0) > 0) return 0;
  const side = (Math.floor((w.tick + w.seed % 37) / 23) % 2) ? 1 : -1;
  const facing = Math.abs(angNorm(Math.atan2(n.y-w.t.y,n.x-w.t.x)-w.t.facing));
  let action = 1;
  if (visible && w.t.fistCharge > 0 && d < 3.5) action = 2;
  else if (d < 1.7 && n.cd === 0) action = 7;
  else if (d < 2.5 && n.cd > 0) action = side > 0 ? 3 : 4;
  else if (visible && facing < .25 && d > 3 && w.t.reloadLeft === 0) action = side > 0 ? 5 : 6;
  if (visible && n.burstRest === 0 && d > 2 && (w.t.reloadLeft > 0 || facing < .25 || w.t.fistCharge > 0)) {
    n.burstTicks = 5; n.burstRest = 24;
  }
  if (action > 0 && action < 7) {
    const dirs: Record<number, number[]> = {1:[1,0],2:[-1,0],3:[0,1],4:[0,-1],5:[.707,.707],6:[.707,-.707]};
    const clearance = (a:number) => {const [u,v]=dirs[a];return rayFree(n.x,n.y,f.ux*u+f.vx*v,f.uy*u+f.vy*v,2,w.propSolids);};
    // Choose a clear side around pillars instead of walking into the same wall.
    if (clearance(action) < 1) action = clearance(3) > clearance(4) ? 3 : 4;
  }
  return action;
}
