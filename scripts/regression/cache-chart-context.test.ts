import assert from 'node:assert/strict';
import Module from 'node:module';
import { generateChart } from '../../lib/ziwei/algorithm';

// Next.js supplies this marker at build time; it has no runtime behavior in this Node-only test.
const loader = Module as unknown as { _load: (request: string, ...args: unknown[]) => unknown };
const originalLoad = loader._load;
loader._load = function (request, ...args) {
  return request === 'server-only' ? {} : originalLoad.call(this, request, ...args);
};
async function main() {
const { buildChartContext, buildChartContextParts } = await import('../../lib/chart-context');
loader._load = originalLoad;
for (const gender of ['male', 'female'] as const) {
  const chart = generateChart({ year: 1998, month: 3, day: 14, hour: 5, gender });
  const questions = ['2026年事业如何？', '2028年感情如何？', '2200年运势如何？', '从出生到现在的经历'];
  const parts = questions.map(question => buildChartContextParts(chart, question)!);
  assert.ok(parts.every(item => item.stable === parts[0].stable), 'the same chart must keep a stable prefix');
  for (let i = 0; i < questions.length; i++) {
    const original = JSON.parse(buildChartContext(chart, questions[i])!);
    const stable = JSON.parse(parts[i].stable);
    const dynamic = JSON.parse(parts[i].dynamic);
    assert.deepEqual(dynamic.focusedFlowYears, original.focusedFlowYears);
    assert.deepEqual([...stable.liunian, ...dynamic.extraFlowYears].sort((a, b) => a.year - b.year), original.liunian);
    const { focusedFlowYears, liunian, ...other } = original;
    const { liunian: stableYears, ...stableOther } = stable;
    assert.deepEqual(stableOther, other);
  }
}
console.log('Cache chart context preservation passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
