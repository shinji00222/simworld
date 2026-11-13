import assert from 'node:assert/strict'
import test from 'node:test'
import { runComparison } from '../src/core.mjs'
import { createDraft, defaultSettings, makeAgents } from '../src/scenes.mjs'

for (const scene of ['market', 'cafeteria']) {
  test(`${scene}: 1, 3, and 5 plans share inputs and preserve existing results`, () => {
    const config = createDraft(scene)
    const baseline = config.scenarios[0]
    const plans = Array.from({ length: 5 }, (_, index) => ({ ...baseline, id: index + 1, name: `方案 ${index + 1}` }))
    const input = { ...config, scenarios: plans }
    const copy = structuredClone(input)
    const full = runComparison(input)
    assert.deepEqual(input, copy)
    for (const size of [1, 3, 5]) {
      const result = runComparison({ ...input, scenarios: plans.slice(0, size) })
      assert.deepEqual(result.results, full.results.slice(0, size))
      for (const plan of result.results) {
        assert.deepEqual(plan.events, result.results[0].events)
        assert.deepEqual(plan.metrics, result.results[0].metrics)
      }
    }
    assert.deepEqual(runComparison({ ...input, scenarios: [plans[0], plans[4]], baseline: 5 }).results, [full.results[0], full.results[4]])
  })
}

test('market applies individual willingness and budget to a discount', () => {
  const draft = createDraft('market')
  const plans = draft.scenarios
  const config = {
    ...draft, duration: 1,
    agents: [{ name: '小林', willingness: 95, budget: 95, frequency: 100 }],
  }
  const [original, discount] = runComparison(config).results
  assert.equal(original.metrics.sales, 0)
  assert.deepEqual(discount.metrics, { sales: 1, profit: 25, inventory: plans[1].stock - 1, missed: 0 })
  assert.match(discount.events[0].detail, /余额 5 元/)
  config.agents[0].willingness = 89
  assert.equal(runComparison(config).results[1].metrics.sales, 0)
})

test('cafeteria applies patience, arrival and window capacity', () => {
  const draft = createDraft('cafeteria')
  const agents = makeAgents('cafeteria', '赶课学生', 3).map(agent => ({ ...agent, arrival: 0, patience: 1, speed: 100 }))
  const [single, triple] = runComparison({
    ...draft, agents, scenarios: [
      { ...defaultSettings('cafeteria'), id: 1, name: '单窗口', windows: 1 },
      { ...defaultSettings('cafeteria'), id: 2, name: '三窗口', windows: 3 },
    ],
  }).results
  assert.deepEqual(single.metrics, { served: 1, wait: 0, peak: 2, left: 2, pending: 0 })
  assert.deepEqual(triple.metrics, { served: 3, wait: 0, peak: 0, left: 0, pending: 0 })
  assert.throws(() => runComparison({ ...draft, baseline: 999 }), /基准/)
  assert.throws(() => runComparison({ ...draft, duration: '' }), /时长/)
})

test('scene names round-trip independently of simulation rules', () => {
  const config = createDraft('market')
  const original = runComparison(config)
  const renamed = runComparison({ ...config, sceneName: '  周末市集  ' })
  assert.equal(renamed.sceneName, '周末市集')
  assert.deepEqual(renamed.results, original.results)
  assert.equal(runComparison({ ...config, sceneName: undefined }).sceneName, '小型市场')
  assert.equal(runComparison({ ...config, sceneName: '   ' }).sceneName, '小型市场')
  assert.throws(() => runComparison({ ...config, sceneName: '市'.repeat(81) }), /场景名称/)
})
