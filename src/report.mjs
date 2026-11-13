import { scenes } from './scenes.mjs'

function cell(value) {
  return String(value ?? '—').replace(/\s+/g, ' ').trim().replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]).replace(/[\\|`*_~\[\]#!]/g, '\\$&')
}

function table(headers, rows) {
  const row = values => '| ' + values.map(cell).join(' | ') + ' |'
  return [row(headers), row(headers.map(() => '---')), ...Array.from(rows, row)].join('\n')
}

function* eventRows(events) {
  for (const { time, agent, action, detail } of events) yield [time, agent, action, detail]
}

export function exportReport(run, draft) {
  const spec = scenes[run.scene]
  const unit = run.scene === 'cafeteria' ? '分钟' : '天'
  const baseline = run.results.find(result => result.id === run.baseline)
  const name = run.sceneName || draft.sceneName?.trim() || spec.name
  const agentFields = [...spec.traits, ...spec.initial]
  const plans = new Map(draft.scenarios.map(plan => [plan.id, plan]))
  const sections = [
    `# ${cell(name)} · 模拟实验报告`,
    `- 场景模板：${cell(spec.name)}\n- 模拟时长：${run.duration} ${unit}\n- 随机种子：${run.seed}\n- 基准方案：${cell(baseline.name)}\n- Agent 数量：${draft.agents.length}`,
    '## 方案参数',
    table(['方案', ...spec.settings.map(([, label]) => label)], run.results.map(result => [
      result.name, ...spec.settings.map(([key]) => plans.get(result.id)[key]),
    ])),
    '## 指标对比',
    table(['方案', ...spec.metrics.map(([, label, unit]) => `${label}（${unit}）`)], run.results.map(result => [
      result.id === run.baseline ? `${result.name}（基准）` : result.name,
      ...spec.metrics.map(([key]) => result.metrics[key]),
    ])),
    '## Agent 配置',
    table(['名称', '分组', ...agentFields.map(([, label]) => label)], draft.agents.map(agent => [
      agent.name, agent.template, ...agentFields.map(([key]) => agent[key]),
    ])),
    '## 事件记录',
  ]
  for (const [index, result] of run.results.entries()) {
    sections.push(`### ${index + 1}. ${cell(result.name)}（${result.events.length} 条）`)
    sections.push(result.events.length ? table([unit, 'Agent', '动作', '详情'], eventRows(result.events)) : '无事件。')
  }

  const blob = new Blob([sections.join('\n\n'), '\n'], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `simworld-report-${new Date().toISOString().replace(/[:.]/g, '-')}.md`
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
