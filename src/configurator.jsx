import React, { useState } from 'react'

async function post(path, input) {
  const response = await fetch('/simworld/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-SimWorld-Request': '1' },
    body: JSON.stringify(input),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || '请求失败')
  return result
}

export function AgentConfigurator({ draft, spec, apply }) {
  const [request, setRequest] = useState('')
  const [models, setModels] = useState(null)
  const [selection, setSelection] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [review, setReview] = useState(0)
  const current = preview?.duration === draft.duration ? preview : null
  const candidate = current?.agents[review]

  async function loadModels() {
    setError('')
    try {
      const catalog = await post('models', {})
      setModels(catalog)
      setSelection(catalog.length === 1 ? '0' : '')
    } catch (failure) {
      setError(failure.message)
    }
  }

  async function generate() {
    setBusy(true)
    setPreview(null)
    setError('')
    try {
      const { provider, model } = models[Number(selection)]
      const result = await post('configure', { provider, model, request, scene: draft.scene, duration: draft.duration })
      setReview(0)
      setPreview({ ...result, duration: draft.duration })
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <div className="sw-configure">
    <h3>实验配置 Agent</h3>
    <label className="sw-field">配置要求<textarea rows={3} maxLength={3000} value={request} placeholder={draft.scene === 'cafeteria' ? '例如：20 位学生，其中 8 位赶课，最多排 4 分钟，其余愿意等 15 分钟' : '例如：30 位顾客，其中 10 位预算 95 元，只在价格低于 90 元时购买'} onChange={e => { setRequest(e.target.value); setPreview(null) }} disabled={busy} /></label>
    <div className="sw-heading">
      {models?.length ? <label className="sw-field sw-grow">配置模型<select value={selection} onChange={e => setSelection(e.target.value)} disabled={busy}><option value="">请选择</option>{models.map((item, index) => <option key={index} value={index}>{item.label} · {item.provider}</option>)}</select></label> : <button type="button" onClick={loadModels}>加载 DSH 模型</button>}
      <button type="button" onClick={generate} disabled={busy || !request.trim() || selection === ''}>{busy ? '生成中…' : '生成草稿'}</button>
    </div>
    {models?.length === 0 && <p className="sw-caption">请先在 DSH 的模型设置中启用模型。</p>}
    {error && <p className="sw-error" role="alert">{error}</p>}
    {candidate && <div className="sw-configure sw-divider">
      <label className="sw-field">草稿预览 · {current.agents.length} 人<select value={review} onChange={e => setReview(Number(e.target.value))}>{current.agents.map((agent, index) => <option key={index} value={index}>{agent.name}</option>)}</select></label>
      <dl>{[...spec.traits, ...spec.initial].map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{candidate[key]}</dd></div>)}</dl>
      {current.notes.length > 0 && <ul>{current.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
      <button type="button" onClick={() => { apply(current.agents); setPreview(null) }}>应用草稿并替换现有名单</button>
    </div>}
  </div>
}
