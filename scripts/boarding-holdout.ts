// Opponents 15–20, frozen before training. Used exclusively in the final evaluation.
import { getView, type World } from '../src/strategy/engine';
import { boardingPlan } from '../src/strategy/boarding-agents';
import { MISSIONS, orderCost } from '../src/strategy/tactics';

export function reservedOpponent(world: World, style: number): ReturnType<typeof boardingPlan> {
  const v = getView(world, -1), t = v.tactics!;
  const contact = v.contacts.some(c => c.seen === v.turn);
  const valuable = MISSIONS[t.mission].values.indexOf(Math.max(...MISSIONS[t.mission].values) as 1 | 2 | 3);
  switch (style) {
    case 15: { // Change the order of a three-system rotation when behind.
      const route = v.score.imperium < v.score.nightlords ? [2, 1, 0] : [1, 0, 2];
      return boardingPlan(v, route[Math.floor((v.turn - 1) / 4) % 3] + (contact ? 9 : 0));
    }
    case 16: { // Early power, then the valuable system, then an unowned alternative.
      const alternative = [1, 0, 2].find(i => i !== valuable && v.objectives[i].owner !== v.side) ?? valuable;
      return boardingPlan(v, (v.turn < 5 ? 1 : v.turn < 10 ? valuable : alternative) + (v.turn % 4 === 1 ? 3 : 0));
    }
    case 17: { // React to public incident forecasts and own hand.
      const goal = t.incident.kind === 'vent' ? (t.incident.sector + 1) % 3 : t.incident.sector;
      return boardingPlan(v, goal + (contact && t.hand.includes('crossfire') ? 6 : 0));
    }
    case 18:
    case 19:
    case 20: { // Two teams of loyalist counters pursue separate goals with one shared PC budget.
      const lead = style === 18 ? valuable : style === 19 ? 2 : (Math.floor((v.turn - 1) / 5) % 3);
      const other = (lead + (style === 19 ? 2 : 1)) % 3;
      const postures = [contact ? 6 : 0, v.turn % 3 === 1 ? 3 : 9];
      const plans = [lead, other].map((goal, team) => {
        const units = v.units.filter(u => Number(u.id.slice(1)) % 2 === team);
        return boardingPlan({ ...v, units }, goal + postures[team]);
      });
      const card = plans[0].card;
      let remaining = t.budget - Number(Boolean(card));
      const orders = plans.flatMap(p => p.orders).filter(o => {
        const cost = orderCost(o);
        if (cost > remaining) return false;
        remaining -= cost;
        return true;
      });
      return { orders, card };
    }
    default: throw Error('Unknown reserved opponent ' + style);
  }
}
