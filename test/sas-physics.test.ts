import { describe, expect, test } from 'bun:test';
import { INITIAL_CRATES, impulseFor, percentiles, qualityFor } from '../web/sas/physics';

describe('Le Sas — contrat physique pur', () => {
  test('sept caisses, une impulsion finie et dirigée vers le sas pour chacune', () => {
    expect(INITIAL_CRATES).toHaveLength(7);
    INITIAL_CRATES.forEach((_, i) => {
      const { impulse, torque } = impulseFor(i);
      expect(impulse.z).toBeLessThan(0);
      expect(impulse.y).toBeGreaterThan(0);
      expect(Object.values(impulse).every(Number.isFinite)).toBeTrue();
      expect(Object.values(torque).every(Number.isFinite)).toBeTrue();
    });
  });
  test('reduced motion réduit seulement l’impulsion verticale, pas la simulation', () => {
    INITIAL_CRATES.forEach((_, i) => {
      expect(impulseFor(i, true).impulse.y).toBeLessThan(impulseFor(i, false).impulse.y);
      expect(impulseFor(i, true).impulse.z).toBe(impulseFor(i, false).impulse.z);
    });
  });
  test('le mobile passe en éco, le choix explicite reste prioritaire', () => {
    expect(qualityFor(390)).toBe('low');
    expect(qualityFor(1440)).toBe('high');
    expect(qualityFor(390, 'high')).toBe('high');
  });
  test('les percentiles sont calculés sur la fenêtre réelle', () => {
    expect(percentiles([10, 20, 30, 40])).toEqual({ median: 20, p95: 40, p99: 40, count: 4 });
    expect(percentiles([])).toEqual({ median: 0, p95: 0, p99: 0, count: 0 });
  });
});
