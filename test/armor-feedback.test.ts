import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioDirector } from '../web/audio/director';
import { engine } from '../web/audio/engine';
import { createViewmodel } from '../web/camera/viewmodel';

test('FPS audio starts on damage/fire event, ignores later third-person cue, and distinguishes missed fist', () => {
  const played: string[] = [];
  const original = engine.play;
  engine.play = (name: string) => { played.push(name); return true; };
  try {
    const d = new AudioDirector(); d.firstPerson = true;
    const w = { t: { x: 0, y: 0, vx: 0, vy: 0, servoAlarm: 0 }, nls: [], done: false, winner: null };
    d.handleEvent({ type: 'bolt', kill: -1 }, w);
    assert.equal(played.filter(n => n === 'bolter-shot').length, 1);
    d.onAnimCue({ kind: 'fire', role: 'TERM', who: 'term', clip: 'proc-shoot', time: .18 });
    assert.equal(played.filter(n => n === 'bolter-shot').length, 1);
    played.length = 0;
    d.handleEvent({ type: 'fist', kill: -1, staggered: false }, w);
    assert.ok(played.includes('claw-swoosh'));
    assert.ok(!played.includes('fist-impact'));
    played.length = 0;
    d.handleEvent({ type: 'fist', kill: -1, staggered: true }, w);
    assert.ok(played.includes('fist-impact'));
    played.length = 0;
    d.handleEvent({ type: 'step', intensity: 0 }, w);
    assert.ok(played.includes('armor-lock'));
    assert.ok(!played.includes('armor-tread'));
  } finally { engine.play = original; }
});

test('weapon weight follows simulation time: freezes paused and settles after impulse', () => {
  const vm = createViewmodel();
  vm.update(0, 0, 0, 0, false);
  vm.ingestSim({ type: 'step', intensity: 1, foot: 1 });
  vm.ingestSim({ type: 'bolt' });
  vm.update(.016, .016, 0, 0, true);
  const p = vm.root.position.clone();
  vm.update(.016, .016, 0, 0, true);
  assert.deepEqual(vm.root.position.toArray(), p.toArray());
  for (let i = 2; i < 120; i++) vm.update(.016, i*.016, 0, 0, false);
  assert.ok(Math.abs(vm.root.position.z) < .001);
  assert.ok(Math.abs(vm.root.position.y) < .01);
  vm.dispose();
});
