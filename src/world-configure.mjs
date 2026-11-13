import { validateExperiment } from './world.mjs'
import { evacuationDraft } from './world-templates.mjs'

export async function configureWorld(llm, input, signal) {
  const { request, provider, model } = input ?? {}
  if (typeof request !== 'string' || !request.trim() || request.length > 3000) throw new Error('请输入 1 到 3000 字的配置要求')
  if (typeof provider !== 'string' || !provider || typeof model !== 'string' || !model) throw new Error('请选择配置模型')
  const system = [
    '你是 SimWorld 配置助手。生成一个用户可编辑的模拟实验草稿。仅返回 JSON 对象 {config,notes}。',
    'config 的结构见下方示例，notes 为最多 20 条简短说明。明确写出假设和无法建模的要求。',
    'world.state 和 role.state 为字符串键到字符串、数字或布尔值的映射。人物可覆盖角色的 start,speed,delay,known,assist,policy,state。',
    '通道双向，seconds 为耗时，capacity 为同一时刻容纳人数。地点 exit=true 表示抵达即撤离。速度为百分比，协助需求将速度减半。',
    'rule 支持 trigger=time(填写 at), tick 或 event(填写 event)。不填 role 作用于世界，否则逐个作用于该角色。可选 condition={scope:world|person,field,op:eq|ne|gt|gte|lt|lte,value}。',
    'action.kind: set/add 使用 target 字段和 value，世界字段须先定义；route 选择已知出口；transfer 的 target 为相邻地点；close/open/inform 的 target 为地点或通道；emit 的 target 为事件标识，delay 为正整数。',
    '指标为 {id,name,scope:world|person,kind:count|sum|average,field}。计划定时规则不能早于 forkAt。保持人物数量适中，使用英文 ID，所有引用必须有效，禁止脚本。',
    '示例（人物省略）：' + JSON.stringify({ ...evacuationDraft(), world: { ...evacuationDraft().world, people: [{ id: 'person1', name: '学生', role: 'familiar' }] } }),
  ].join('\n')
  let text = '', finished = false
  for await (const chunk of llm.stream({ provider, model, system, signal, maxTokens: 8192, messages: [{ role: 'user', content: [{ type: 'text', text: request.trim() }] }] })) {
    if (chunk.type === 'text-delta') text += chunk.text
    if (chunk.type === 'finish') finished = chunk.reason?.kind === 'stop'
    if (text.length > 64000) throw new Error('模型返回内容过长')
  }
  if (!finished) throw new Error('模型未完整返回草稿，请减少人数或缩短需求')
  let draft
  try { draft = JSON.parse(text.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '')) }
  catch { throw new Error('模型没有返回有效 JSON') }
  validateExperiment(draft?.config)
  if (!Array.isArray(draft.notes) || draft.notes.length > 20 || draft.notes.some(note => typeof note !== 'string' || note.length > 500)) throw new Error('草稿说明无效')
  return draft
}
