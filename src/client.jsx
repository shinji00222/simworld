import React, { useState } from 'react'
import { createDraft, defaultSettings, makeAgents, scenes } from './scenes.mjs'
import css from './panel.css'

const PANEL = 'simworld'
const format = value => value === null ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })

function Icon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 3h6m-5 0v7l-5.2 8.3A1.75 1.75 0 0 0 6.3 21h11.4a1.75 1.75 0 0 0 1.5-2.7L14 10V3M7 15h10" /></svg>
}

function NumberField({ label, value, min, max, onChange }) {
  return <label className="sw-field">{label}<input type="number" required min={min} max={max} value={value} onChange={e => onChange(e.target.value === '' ? '' : e.target.valueAsNumber)} /></label>
}

function AgentEditor({ draft, update }) {
  const spec = scenes[draft.scene]
  const [selected, setSelected] = useState(0)
  const [template, setTemplate] = useState(() => Object.keys(spec.templates)[0])
  const [count, setCount] = useState(5)
  const index = Math.min(selected, draft.agents.length - 1)
  const agent = draft.agents[index]
  const replace = values => update({ agents: draft.agents.map((item, i) => i === index ? { ...item, ...values } : item) })

  function add() {
    if (!Number.isInteger(count) || count < 1 || draft.agents.length + count > 500) return
    const offset = draft.agents.length
    update({ agents: [...draft.agents, ...makeAgents(draft.scene, template, count, offset)] })
    setSelected(offset)
  }

  return <section className="sw-block">
    <div className="sw-heading"><h2>Agent 配置</h2><span>{draft.agents.length} 人 · {spec.role}</span></div>
    <div className="sw-batch">
      <label className="sw-field">角色模板<select value={template} onChange={e => setTemplate(e.target.value)}>{Object.keys(spec.templates).map(name => <option key={name}>{name}</option>)}</select></label>
      <label className="sw-field">人数<input type="number" min="1" max="500" value={count} onChange={e => setCount(e.target.value === '' ? '' : e.target.valueAsNumber)} /></label>
      <button type="button" onClick={add} disabled={!Number.isInteger(count) || count < 1 || draft.agents.length + count > 500}>批量添加</button>
    </div>
    <div className="sw-heading sw-divider"><label className="sw-field sw-grow">选择 Agent<select value={index} onChange={e => setSelected(Number(e.target.value))}>{draft.agents.map((item, i) => <option key={i} value={i}>{i + 1}. {item.name} · {item.template}</option>)}</select></label>
      <button type="button" disabled={draft.agents.length === 1} onClick={() => update({ agents: draft.agents.filter((_, i) => i !== index) })}>移除</button>
    </div>
    <label className="sw-field">名称<input required maxLength={80} value={agent.name} onChange={e => replace({ name: e.target.value })} /></label>
    <div className="sw-fields">{spec.traits.map(([key, label, min, max]) => <NumberField key={key} label={label} value={agent[key]} min={min} max={max} onChange={value => replace({ [key]: value })} />)}</div>
    <p className="sw-caption">初始状态</p>
    <div className="sw-fields">{spec.initial.map(([key, label, min, max]) => <NumberField key={key} label={label} value={agent[key]} min={min} max={max} onChange={value => replace({ [key]: value })} />)}</div>
  </section>
}

function Plans({ draft, update }) {
  const spec = scenes[draft.scene]
  const [open, setOpen] = useState(2)
  function add(source) {
    const id = Math.max(...draft.scenarios.map(plan => plan.id)) + 1
    const plan = source ? { ...source, id, name: (source.name.slice(0, 75) || '方案') + ' 副本' }
      : { ...defaultSettings(draft.scene), id, name: `方案 ${id}` }
    update({ scenarios: [...draft.scenarios, plan] })
    setOpen(id)
  }
  function remove(id) {
    const scenarios = draft.scenarios.filter(plan => plan.id !== id)
    update({ scenarios, baseline: draft.baseline === id ? scenarios[0].id : draft.baseline })
    if (open === id) setOpen(scenarios[0].id)
  }
  function edit(id, values) {
    update({ scenarios: draft.scenarios.map(plan => plan.id === id ? { ...plan, ...values } : plan) })
  }

  return <section className="sw-block">
    <div className="sw-heading"><h2>实验方案 <span>{draft.scenarios.length}</span></h2><button type="button" onClick={() => add()}>＋ 添加方案</button></div>
    <div className="sw-plans">{draft.scenarios.map(plan => <div key={plan.id} className="sw-plan">
      <div className="sw-plan-row">
        <button type="button" className="sw-plan-toggle" aria-expanded={open === plan.id} onClick={() => setOpen(open === plan.id ? null : plan.id)}><span aria-hidden>{open === plan.id ? '⌄' : '›'}</span>{plan.name || '未命名方案'}</button>
        <label className="sw-radio"><input type="radio" name="baseline" checked={plan.id === draft.baseline} onChange={() => update({ baseline: plan.id })} />基准</label>
        <button type="button" onClick={() => add(plan)}>复制</button>
        <button type="button" disabled={draft.scenarios.length < 2} onClick={() => remove(plan.id)}>移除</button>
      </div>
      {open === plan.id && <div className="sw-plan-fields">
        <label className="sw-field">方案名称<input required maxLength={80} value={plan.name} onChange={e => edit(plan.id, { name: e.target.value })} /></label>
        <div className="sw-fields">{spec.settings.map(([key, label, , min, max]) => <NumberField key={key} label={label} value={plan[key]} min={min} max={max} onChange={value => edit(plan.id, { [key]: value })} />)}</div>
      </div>}
    </div>)}</div>
  </section>
}

function Results({ run }) {
  const spec = scenes[run.scene]
  const [selected, setSelected] = useState(run.baseline)
  const [page, setPage] = useState(0)
  const baseline = run.results.find(item => item.id === run.baseline)
  const current = run.results.find(item => item.id === selected)
  const primary = run.scene === 'cafeteria' ? 'wait' : 'sales'
  const metric = spec.metrics.find(([key]) => key === primary)
  const largest = Math.max(1, ...run.results.map(item => item.metrics[primary] ?? 0))
  const pageSize = 20

  return <section className="sw-block" aria-label="实验结果">
    <div className="sw-heading"><h2>实验结果</h2><span>种子 {run.seed} · {run.duration} {run.scene === 'cafeteria' ? '分钟' : '天'}</span></div>
    <div className="sw-chart" aria-label={metric[1]}>
      <p className="sw-caption">{metric[1]}（{metric[2]}）</p>
      {run.results.map(item => <div className="sw-bar-row" key={item.id}><span title={item.name}>{item.name}</span><div className="sw-track"><div className={item.id === run.baseline ? 'sw-bar sw-baseline' : 'sw-bar'} style={{ width: `${(item.metrics[primary] ?? 0) / largest * 100}%` }} /></div><strong>{format(item.metrics[primary])}</strong></div>)}
    </div>
    <div className="sw-scroll"><table>
      <thead><tr><th>方案</th>{spec.metrics.map(([key, label, unit]) => <th key={key}>{label}（{unit}）</th>)}</tr></thead>
      <tbody>{run.results.map(item => <tr key={item.id}><th scope="row">{item.name}{item.id === run.baseline && <small>基准</small>}</th>{spec.metrics.map(([key]) => {
        const value = item.metrics[key]
        const base = baseline.metrics[key]
        const delta = value === null || base === null ? null : value - base
        return <td key={key}>{format(value)}{item.id !== run.baseline && delta !== null && <small>{delta > 0 ? '+' : ''}{format(delta)}</small>}</td>
      })}</tr>)}</tbody>
    </table></div>
    <div className="sw-heading sw-divider"><h3>事件记录 <span>{current.events.length}</span></h3>
      <label className="sw-field">查看方案<select value={selected} onChange={e => { setSelected(Number(e.target.value)); setPage(0) }}>{run.results.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    </div>
    {current.events.length ? <div className="sw-scroll"><table><thead><tr><th>{run.scene === 'cafeteria' ? '分钟' : '天'}</th><th>Agent</th><th>动作</th><th>详情</th></tr></thead><tbody>{current.events.slice(page * pageSize, (page + 1) * pageSize).map((item, i) => <tr key={i}><td>{item.time}</td><td>{item.agent}</td><td>{item.action}</td><td>{item.detail}</td></tr>)}</tbody></table></div> : <p className="sw-caption">这个方案没有事件。</p>}
    {current.events.length > pageSize && <div className="sw-pages"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button><span>{page + 1} / {Math.ceil(current.events.length / pageSize)}</span><button type="button" disabled={(page + 1) * pageSize >= current.events.length} onClick={() => setPage(page + 1)}>下一页</button></div>}
  </section>
}

function Panel() {
  const [scene, setScene] = useState('cafeteria')
  const [drafts, setDrafts] = useState(() => ({ cafeteria: createDraft('cafeteria'), market: createDraft('market') }))
  const [report, setReport] = useState(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const draft = drafts[scene]
  const spec = scenes[scene]
  const update = values => setDrafts(previous => ({ ...previous, [scene]: { ...previous[scene], ...values } }))

  async function run(e) {
    e.preventDefault()
    setPending(true)
    setError('')
    try {
      const response = await fetch('/simworld/run', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-SimWorld-Request': '1' }, body: JSON.stringify(draft) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '实验运行失败')
      setReport({ draft, result })
    } catch (failure) {
      setError(failure.message)
    } finally {
      setPending(false)
    }
  }

  return <div className="sw-page">
    <style>{css}</style>
    <form className="sw-container" onSubmit={run}>
      <header className="sw-header"><div><h1>模拟实验室</h1><p>配置场景和 Agent，从同一初始条件运行不同方案。</p></div><button className="sw-primary" disabled={pending} type="submit">{pending ? '运行中…' : '运行实验'}</button></header>
      {error && <p role="alert" className="sw-error">{error}</p>}
      <div className="sw-grid">
        <div className="sw-stack">
          <section className="sw-block"><div className="sw-heading"><h2>场景设置</h2></div>
            <div className="sw-scenes">{Object.entries(scenes).map(([id, item]) => <button key={id} type="button" aria-pressed={id === scene} onClick={() => { setScene(id); setError('') }}><strong>{item.name}</strong><span>{item.description}</span></button>)}</div>
            <div className="sw-fields"><NumberField label={spec.duration[0]} value={draft.duration} min={spec.duration[2]} max={spec.duration[3]} onChange={duration => update({ duration })} /><NumberField label="随机种子" value={draft.seed} min={0} max={4294967295} onChange={seed => update({ seed })} /></div>
          </section>
          <AgentEditor key={scene} draft={draft} update={update} />
        </div>
        <div className="sw-stack">
          <Plans key={scene} draft={draft} update={update} />
          {report?.draft === draft ? <Results key={JSON.stringify(draft)} run={report.result} /> : <section className="sw-block"><div className="sw-heading"><h2>实验结果</h2></div><p className="sw-empty">{report?.draft.scene === scene ? '设置已修改，运行实验以刷新结果。' : '运行实验后，在这里查看指标和事件记录。'}</p></section>}
        </div>
      </div>
    </form>
  </div>
}

export const inject = ['slots']
export function apply(ctx) {
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL, inject: () => ({}) }, Panel))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL, order: 20, label: () => '模拟实验室' }, Icon))
}
