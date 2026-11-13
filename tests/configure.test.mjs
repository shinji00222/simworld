import assert from 'node:assert/strict'
import test from 'node:test'
import { configureAgents } from '../src/configure.mjs'

const input = { scene: 'cafeteria', duration: 30, request: '三位赶课学生', provider: 'test', model: 'test-model' }
function adapter(value, kind = 'stop') {
  return { async *stream(options) {
    assert.equal(options.messages[0].content[0].text, input.request)
    yield { type: 'text-delta', text: JSON.stringify(value) }
    yield { type: 'finish', reason: { kind } }
  } }
}

test('configuration agent expands custom groups into editable participants', async () => {
  const data = { groups: [{ name: '赶课学生', count: 3, values: { patience: 4, arrival: [0, 8], speed: 80 } }], notes: ['点餐速度为假设'] }
  const result = await configureAgents(adapter(data), input)
  assert.deepEqual(result.agents.map(agent => [agent.name, agent.patience, agent.arrival]), [['赶课学生 1', 4, 0], ['赶课学生 2', 4, 4], ['赶课学生 3', 4, 8]])
  assert.deepEqual(result.notes, data.notes)
  await assert.rejects(configureAgents(adapter(data, 'max-tokens'), input), /未完整/)
  data.groups[0].values.arrival = 30
  await assert.rejects(configureAgents(adapter(data), input), /允许范围/)
  data.groups[0].count = 501
  await assert.rejects(configureAgents(adapter(data), input), /人数无效/)
})
