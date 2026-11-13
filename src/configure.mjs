import { scenes } from './scenes.mjs'

export async function configureAgents(llm, input, signal) {
  const { scene, request, provider, model, duration } = input ?? {}
  if (!Object.hasOwn(scenes, scene)) throw new Error('请选择有效场景')
  if (typeof request !== 'string' || !request.trim() || request.length > 3000) throw new Error('请输入 1 到 3000 字的配置要求')
  if (typeof provider !== 'string' || typeof model !== 'string' || !provider || !model) throw new Error('请选择配置模型')
  const spec = scenes[scene]
  if (!Number.isInteger(duration) || duration < spec.duration[2] || duration > spec.duration[3]) throw new Error('请先填写有效的模拟时长')
  const fields = [...spec.traits, ...spec.initial].map(([key, label, min, max]) => [key, label, min, key === 'arrival' ? duration - 1 : max])
  const system = [
    '你是 SimWorld 的实验配置 Agent。把用户的自然语言要求转为当前场景的参与者配置。',
    '仅返回 JSON 对象，结构为 {"groups":[{"name":"自定义群体名称","count":整数,"values":{}}],"notes":["假设或未支持的要求"]}。',
    '每个群体必须提供 values 中所有字段，每个值是一个整数或两个整数组成的闭区间 [最小值,最大值]。总人数 1–500。可用 count=1 表达单个具名角色。',
    '保持用户指定的人数和数值。对缺失的数值做合理假设并写入 notes。把无法映射到当前场景字段的要求写入 notes，不能声称已支持。只生成参与者配置。',
    `当前场景：${spec.name}，可模拟角色：${spec.role}，时长：${duration}。可用字段：${JSON.stringify(fields)}。`,
  ].join('\n')
  let text = ''
  let finished = false
  for await (const chunk of llm.stream({
    provider, model, system, signal, maxTokens: 4096,
    messages: [{ role: 'user', content: [{ type: 'text', text: request.trim() }] }],
  })) {
    if (chunk.type === 'text-delta') text += chunk.text
    if (text.length > 24000) throw new Error('配置模型返回内容过长')
    if (chunk.type === 'finish') finished = chunk.reason?.kind === 'stop'
  }
  if (!finished) throw new Error('配置模型未完整返回，请重试或换一个模型')
  let result
  try {
    result = JSON.parse(text.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, ''))
  } catch {
    throw new Error('配置模型返回的格式无效，请重试')
  }
  if (!Array.isArray(result?.groups) || !result.groups.length || result.groups.length > 500 ||
      !Array.isArray(result.notes) || result.notes.length > 20 || result.notes.some(note => typeof note !== 'string' || note.length > 500)) {
    throw new Error('配置模型返回的分组或说明无效，请重试')
  }
  const agents = []
  for (const group of result.groups) {
    const name = typeof group?.name === 'string' ? group.name.trim() : ''
    if (!name || name.length > 70 || !Number.isInteger(group.count) || group.count < 1 || agents.length + group.count > 500) {
      throw new Error('模型生成的分组名称或人数无效')
    }
    const ranges = fields.map(([key, label, min, max]) => {
      const value = group.values?.[key]
      const range = Array.isArray(value) ? value : [value, value]
      if (range.length !== 2 || !range.every(Number.isInteger) || range[0] < min || range[1] > max || range[0] > range[1]) {
        throw new Error(`「${name}」的${label}超出允许范围`)
      }
      return [key, ...range]
    })
    for (let index = 0; index < group.count; index++) {
      const ratio = group.count === 1 ? 0.5 : index / (group.count - 1)
      const values = Object.fromEntries(ranges.map(([key, low, high]) => [key, Math.round(low + ratio * (high - low))]))
      agents.push({ name: group.count === 1 ? name : `${name} ${index + 1}`, template: name, ...values })
    }
  }
  return { agents, notes: result.notes }
}
