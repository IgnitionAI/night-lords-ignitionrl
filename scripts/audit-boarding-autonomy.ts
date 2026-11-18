import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { actorPath, digest, evidence, initialActor, readJSON, runRoot, seeds, trainResidues, trainingCase } from './boarding-experiment';
import type { Demo } from './boarding-demonstrations';

const start = digest(JSON.stringify(initialActor().layers));
const cases = Array.from({length:108}, (_,i) => trainingCase(i));
assert.equal(new Set(cases.map(c => JSON.stringify(c))).size, 108);
assert.ok(cases.every(c => trainResidues.includes(c.seed % 12) && c.style < 6));
const demos: Demo[] = readJSON(runRoot + '/demos.json');
assert.ok(demos.every(d => d.observation.length === 72 && d.observation.every(Number.isFinite) &&
  [0,1,2].includes(d.objective) && d.postures.every(p => p >= 0 && p <= 1) && Math.abs(d.postures.reduce((a,b) => a+b,0)-1) < 1e-6));
const imitation = {episodes:108, examples:demos.length, objectiveCounts:[0,1,2].map(i => demos.filter(r => r.objective === i).length),
  datasetSHA256:digest(readFileSync(runRoot+'/demos.json')), actors:seeds.map(seed => {
    const path = actorPath(seed, 'imitation', 0), actor = readJSON(path);
    return {seed, trainingAgreement:actor.meta.trainingAgreement, supervisedSteps:actor.meta.supervisedSteps, sha256:digest(readFileSync(path))};
  })};
const budgets = [];
for (const seed of seeds) {
  const warm = readJSON(actorPath(seed,'imitation',0)), regular = readJSON(actorPath(seed,'ordinary',90));
  const warmHash = digest(JSON.stringify(warm.layers));
  for (const [branch, update] of [['imitation',0],['reminders',30],['ordinary',90],['candidate',90]] as const) {
    const model = readJSON(actorPath(seed,branch,update)), meta = model.meta;
    const rl = branch === 'candidate' || branch === 'ordinary';
    assert.equal(meta.startingPolicyHash, start);
    assert.equal(meta.initialActorHash, branch === 'candidate' || branch === 'reminders' ? warmHash : start);
    assert.notEqual(digest(JSON.stringify(model.layers)), meta.initialActorHash);
    assert.equal(meta.demoEpisodes,branch === 'ordinary' ? 0 : 108);
    assert.equal(meta.supervisedSteps,branch === 'ordinary' ? 0 : warm.meta.supervisedSteps + (branch === 'imitation' ? 0 : 30));
    assert.equal(meta.episodes,rl ? 540 : 0);
    if (rl) {
      assert.deepEqual(meta.trainingSeeds,regular.meta.trainingSeeds);
      assert.ok(meta.trainingSeeds.every((n:number) => trainResidues.includes(n%12)));
      const metrics = readJSON(runRoot+'/'+seed+'/'+branch+'-training-90.json');
      assert.equal(metrics.length,90);
      assert.equal(metrics.at(-1).transitions,meta.transitions);
      for (const m of metrics) {
        const strength = branch === 'ordinary' ? 0 : Math.max(0,(31-m.update)/30);
        assert.equal(m.reminderStrength,strength);
        assert.ok([m.policyLoss,m.valueLoss,m.entropy,m.approxKL].every(Number.isFinite));
      }
    }
    budgets.push({seed,branch,episodes:meta.episodes,decisions:meta.transitions,demoEpisodes:meta.demoEpisodes,
      supervisedSteps:meta.supervisedSteps,reminderSteps:meta.reminderSteps,ppoUpdates:meta.updates,
      weightsSHA256:digest(JSON.stringify(model.layers))});
  }
}
writeFileSync(evidence+'/imitation.json',JSON.stringify(imitation,null,2)+'\n');
writeFileSync(evidence+'/budgets.json',JSON.stringify(budgets,null,2)+'\n');
console.log('Verified the shared start, schedules, inputs and budgets across all three seeds.');
