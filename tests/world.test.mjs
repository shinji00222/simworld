import test from 'node:test'
import assert from 'node:assert/strict'
import { runExperiment } from '../src/world.mjs'
import { blankDraft, evacuationDraft } from '../src/world-templates.mjs'
import { configureWorld } from '../src/world-configure.mjs'

test('paired seeds replay the shared prefix and keep branches independent', () => {
  const config = evacuationDraft()
  const result = runExperiment(config)
  assert.deepEqual(result, runExperiment(config))
  const [base, early] = result.results
  assert.ok(base.runs.some(run => run.events.some(event => event.action === 'blocked')))
  assert.ok(early.runs.every(run => !run.events.some(event => event.action === 'blocked')))
  for (const [i, run] of base.runs.entries()) {
    assert.deepEqual(run.events.filter(e => e.time < config.forkAt), early.runs[i].events.filter(e => e.time < config.forkAt))
    assert.equal(early.runs[i].delta.meanTime, early.runs[i].metrics.meanTime - run.metrics.meanTime)
    for (const branch of [run, early.runs[i]]) {
      assert.ok(!branch.events.some(e => e.action === 'evacuate' && e.detail === 'east' && e.time >= config.forkAt))
      assert.equal(branch.metrics.evacuated + branch.metrics.pending, config.world.people.length)
    }
  }
  const alternate = structuredClone(config)
  alternate.plans[1].rules = []
  assert.deepEqual(runExperiment(alternate).results[0], base)
})

test('capacity is enforced and a person with no route remains in the world', () => {
  const config = blankDraft()
  const { world } = config
  world.duration = 10
  world.nodes.push({ id: 'exit', name: 'Exit', exit: true })
  world.links.push({ id: 'hall', name: 'Hall', from: 'start', to: 'exit', seconds: 2, capacity: 1 })
  world.roles[0].known = ['exit']
  world.people.push({ id: 'person2', name: 'Second', role: 'role1' }, { id: 'person3', name: 'Lost', role: 'role1', known: [] })
  world.rules.push({ id: 'go', name: 'Go', role: 'role1', trigger: 'tick', action: { kind: 'route' } })
  const [run] = runExperiment(config).results[0].runs
  assert.deepEqual(run.events.filter(e => e.action === 'route').map(e => e.time), [0, 2])
  assert.equal(run.metrics.peak, 1)
  assert.equal(run.metrics.pending, 1)
  assert.ok(!run.events.some(e => e.person === 'person3'))
})

test('non-spatial service queue uses the same state and event primitives', () => {
  const config = blankDraft()
  const { world } = config
  world.state = { available: 1 }
  world.people.push({ id: 'person2', name: 'Second', role: 'role1' })
  world.roles[0].state = { served: false }
  world.rules = [
    { id: 'arrive', name: 'Arrivals', trigger: 'time', at: 1, action: { kind: 'emit', target: 'serve', delay: 3 } },
    { id: 'serve', name: 'Serve', trigger: 'event', event: 'serve', role: 'role1', condition: { scope: 'world', field: 'available', op: 'gt', value: 0 }, action: { kind: 'set', target: 'served', value: true } },
    { id: 'capacity', name: 'Consume a slot', trigger: 'event', event: 'serve', role: 'role1', condition: { scope: 'person', field: 'served', op: 'eq', value: true }, action: { kind: 'add', target: 'used', value: 1 } },
  ]
  world.metrics = [{ id: 'used', name: 'Served', scope: 'person', kind: 'sum', field: 'used' }]
  config.forkAt = 3
  config.plans.push({ id: 'paused', name: 'Pause', rules: [{ id: 'stop', name: 'Stop service', trigger: 'time', at: 3, action: { kind: 'set', target: 'available', value: 0 } }] })
  const [baseline, pause] = runExperiment(config).results
  assert.equal(baseline.metrics['custom.used'], 2)
  assert.equal(pause.metrics['custom.used'], 0)
  assert.equal(baseline.runs[0].events.find(e => e.action === 'event').time, 4)
})

test('bad references and pre-fork interventions fail validation', () => {
  const config = evacuationDraft()
  config.world.roles[0].known = ['missing']
  assert.throws(() => runExperiment(config), /出口/)
  config.world.roles[0].known = ['east']
  config.plans[0].rules[0].at = 1
  assert.throws(() => runExperiment(config), /时间/)
})

test('AI drafts are validated before reaching the editor', async () => {
  const config = blankDraft()
  const response = value => ({ async *stream() {
    yield { type: 'text-delta', text: JSON.stringify(value) }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } })
  const input = { provider: 'mock', model: 'mock', request: 'Create a world' }
  assert.deepEqual(await configureWorld(response({ config, notes: ['demo'] }), input), { config, notes: ['demo'] })
  config.world.rules = [{ id: 'script', name: 'Script', trigger: 'tick', action: { kind: 'eval', value: '1' } }]
  await assert.rejects(configureWorld(response({ config, notes: [] }), input), /动作无效/)
})
