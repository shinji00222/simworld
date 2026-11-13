import React, { useState } from 'react'
import { CONDITIONS, RULE_ACTIONS, TRIGGERS } from './world.mjs'
import { addPeople, METRICS, newId, roleDefaults } from './world-templates.mjs'
import { downloadConfig, post } from './lab-api.mjs'

const listOptions = items => items.map(({ id, name }) => [id, name])
const num = text => text === '' ? '' : Number(text)
const shown = value => value == null ? '—' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
const patchItem = (items, index, patch) => items.map((item, i) => index === i ? { ...item, ...patch } : item)
const removeItem = (items, index) => items.filter((_, i) => index !== i)
const scopeOptions = [['world', '世界'], ['person', '人物']]
const actionOptions = Object.entries(RULE_ACTIONS)
const actions = { arrive: '到达', blocked: '发现封闭', queue: '排队', evacuate: '撤离', event: '触发事件', ...RULE_ACTIONS }
export function Field({ label, value, change, type = 'text', ...props }) {
  return <label className="sw-field">{label}<input {...props} type={type} value={value ?? ''} onChange={e => change(type === 'number' ? num(e.target.value) : e.target.value)} /></label>
}
function Select({ label, value, change, options }) {
  return <label className="sw-field">{label}<select value={value ?? ''} onChange={e => change(e.target.value)}>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
}
function Check({ label, value, change }) {
  return <label className="sw-radio"><input type="checkbox" checked={!!value} onChange={e => change(e.target.checked)} />{label}</label>
}
function Value({ label, value, change }) {
  const type = typeof value
  return <div className="sw-fields"><Select label="值类型" value={type} change={kind => change(kind === 'number' ? 0 : kind === 'boolean' ? false : '')} options={ [['number','数字'],['string','文本'],['boolean','布尔值']] } />
    {type === 'boolean' ? <Select label={label} value={String(value)} change={v => change(v === 'true')} options={ [['true','是'],['false','否']] } /> : <Field label={label} type={type === 'number' ? 'number' : 'text'} value={value} change={change} />}</div>
}
function StateFields({ fields, change }) {
  const [key, setKey] = useState('')
  const valid = /^[a-zA-Z][\w-]{0,39}$/.test(key) && !Object.hasOwn(fields, key) && !['constructor','prototype'].includes(key)
  return <div className="sw-stack">
    {Object.entries(fields).map(([id, value]) => <div className="sw-item" key={id}><div className="sw-heading"><strong>{id}</strong><button type="button" onClick={() => change(Object.fromEntries(Object.entries(fields).filter(([k]) => k !== id)))}>移除</button></div><Value label="初始值" value={value} change={value => change({ ...fields, [id]: value })} /></div>)}
    <div className="sw-row"><Field label="新字段标识" value={key} change={setKey} placeholder="例如 taskCount" /><button type="button" disabled={!valid || Object.keys(fields).length >= 24} onClick={() => { change({ ...fields, [key]: 0 }); setKey('') }}>添加字段</button></div>
  </div>
}
function RuleEditor({ rules, change, world, earliest = 0 }) {
  const [selected, select] = useState(null)
  const locations = listOptions([...world.nodes, ...world.links])
  const roles = [['', '整个世界'], ...listOptions(world.roles)]
  const add = () => {
    const id = newId(rules, 'rule')
    change([...rules, { id, name: '新规则', trigger: 'time', at: earliest, action: { kind: 'emit', target: 'signal', delay: 1 } }])
    select(id)
  }
  return <div className="sw-stack">
    {rules.map((rule, i) => {
      const update = patch => change(patchItem(rules, i, patch))
      const { action, condition } = rule
      const patchAction = patch => update({ action: { ...action, ...patch } })
      const patchCondition = patch => update({ condition: { ...condition, ...patch } })
      return <div className="sw-item" key={rule.id}>
        <div className="sw-heading"><button type="button" className="sw-item-toggle" aria-expanded={selected === rule.id} onClick={() => select(selected === rule.id ? null : rule.id)}>{rule.name || '未命名规则'}</button><span>{TRIGGERS[rule.trigger]} · {RULE_ACTIONS[action.kind]}</span></div>
        {selected === rule.id && <div className="sw-stack sw-item-content">
          <div className="sw-fields"><Field label="规则名称" value={rule.name} change={name => update({ name })} /><Select label="作用对象" value={rule.role ?? ''} options={roles} change={role => update({ role: role || null, condition: !role && condition?.scope === 'person' ? null : condition })} />
          <Select label="触发方式" value={rule.trigger} options={Object.entries(TRIGGERS)} change={trigger => update({ trigger, at: rule.at ?? earliest, event: rule.event ?? 'signal' })} />
          {rule.trigger === 'time' && <Field label="触发时刻（秒）" type="number" min={earliest} max={world.duration - 1} value={rule.at} change={at => update({ at })} />}
          {rule.trigger === 'event' && <Field label="事件标识" value={rule.event} change={event => update({ event })} />}
          </div>
          <Check label="添加条件" value={!!condition} change={on => update({ condition: on ? { scope: rule.role ? 'person' : 'world', field: Object.keys(world.state)[0] ?? '', op: 'eq', value: 0 } : null })} />
          {condition && <div className="sw-fields"><Select label="读取状态" value={condition.scope} options={rule.role ? scopeOptions : scopeOptions.slice(0, 1)} change={scope => patchCondition({ scope })} /><Field label="字段标识" value={condition.field} change={field => patchCondition({ field })} /><Select label="比较方式" value={condition.op} options={Object.entries(CONDITIONS)} change={op => patchCondition({ op })} /><Value label="比较值" value={condition.value} change={value => patchCondition({ value })} /></div>}
          <div className="sw-fields">
            <Select label="执行动作" value={action.kind} options={actionOptions} change={kind => update({ action: { kind, target: ['close','open','inform','transfer'].includes(kind) ? world.nodes[0]?.id ?? '' : kind === 'emit' ? 'signal' : Object.keys(world.state)[0] ?? '', value: 0, delay: 1 } })} />
            {['close','open','inform','transfer'].includes(action.kind) && <Select label="目标" value={action.target} options={action.kind === 'transfer' ? listOptions(world.nodes) : locations} change={target => patchAction({ target })} />}
            {['set','add','emit'].includes(action.kind) && <Field label={action.kind === 'emit' ? '事件标识' : '字段标识'} value={action.target} change={target => patchAction({ target })} />}
            {action.kind === 'set' && <Value label="设置为" value={action.value} change={value => patchAction({ value })} />}
            {action.kind === 'add' && <Field label="增量" type="number" value={action.value} change={value => patchAction({ value })} />}
            {action.kind === 'emit' && <Field label="延迟（秒）" type="number" min={1} value={action.delay} change={delay => patchAction({ delay })} />}
          </div>
          <div><button type="button" onClick={() => change(removeItem(rules, i))}>移除规则</button></div>
        </div>}
      </div>
    })}
    <div><button type="button" onClick={add} disabled={rules.length >= 40}>＋ 添加规则</button></div>
  </div>
}
function Topology({ world }) {
  const positions = world.nodes.map((node, i) => {
    if (world.nodes.length === 4) return [ [112,104], [330,104], [548,50], [548,158] ][i]
    return [84 + i % 4 * 164, 44 + Math.floor(i / 4) * 66]
  })
  const map = new Map(world.nodes.map((node, i) => [node.id, positions[i]]))
  const height = Math.max(205, Math.ceil(world.nodes.length / 4) * 66 + 26)
  return <svg className="sw-map" viewBox={'0 0 660 ' + height} role="img" aria-label="地点与通道示意图">
    {world.links.map(link => {
      const from = map.get(link.from), to = map.get(link.to)
      return from && to ? <line key={link.id} x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} /> : null
    })}
    {world.nodes.map((node, i) => <g key={node.id} transform={'translate(' + positions[i].join(',') + ')'}><title>{node.name}</title><rect x="-62" y="-18" width="124" height="36" rx="8" className={node.exit ? 'sw-exit' : ''} /><text textAnchor="middle" dominantBaseline="central">{node.name.length > 8 ? node.name.slice(0, 8) + '…' : node.name}{node.exit ? ' ↗' : ''}</text></g>)}
  </svg>
}
export function WorldEditor({ world, change }) {
  const [tab, setTab] = useState('map')
  const [selected, setSelected] = useState('')
  const places = listOptions(world.nodes)
  function listEdit(field, i, patch) { change({ [field]: patchItem(world[field], i, patch) }) }
  function add(field, item, prefix) {
    const id = newId([...world.nodes, ...world.links, ...world.metrics], prefix)
    change({ [field]: [...world[field], { id, ...item }] })
    setSelected(id)
  }
  return <section className="sw-block" aria-label="世界设置">
    <div className="sw-heading"><h2>世界设置</h2><span>{world.nodes.length} 个地点 · {world.rules.length} 条规则</span></div>
    <div className="sw-fields"><Field label="世界名称" value={world.name} change={name => change({ name })} maxLength={80} /><Field label="模拟时长（秒）" value={world.duration} type="number" min={1} max={600} change={duration => change({ duration })} /></div>
    <Topology world={world} />
    <div className="sw-subnav" aria-label="世界编辑"><button type="button" aria-pressed={tab === 'map'} onClick={() => setTab('map')}>地点与通道</button><button type="button" aria-pressed={tab === 'rules'} onClick={() => setTab('rules')}>世界规则</button><button type="button" aria-pressed={tab === 'metrics'} onClick={() => setTab('metrics')}>状态与指标</button></div>
    {tab === 'map' && <>
      <div className="sw-heading"><h3>地点</h3><button type="button" disabled={world.nodes.length >= 24} onClick={() => add('nodes', { name: '新地点', exit: false }, 'place')}>＋ 添加地点</button></div>
      {world.nodes.map((item, i) => <div className="sw-item" key={item.id}><div className="sw-heading"><button type="button" className="sw-item-toggle" aria-expanded={selected === item.id} onClick={() => setSelected(selected === item.id ? '' : item.id)}>{item.name}</button><span>{item.exit ? '出口' : '地点'} · {item.id}</span></div>
        {selected === item.id && <div className="sw-row sw-item-content"><Field label="地点名称" value={item.name} change={name => listEdit('nodes', i, { name })} /><Check label="设为出口" value={item.exit} change={exit => listEdit('nodes', i, { exit })} /><button type="button" disabled={world.nodes.length <= 1} onClick={() => change({ nodes: removeItem(world.nodes, i), links: world.links.filter(link => link.from !== item.id && link.to !== item.id) })}>移除</button></div>}
      </div>)}
      <div className="sw-heading"><h3>双向通道</h3><button type="button" disabled={world.nodes.length < 2 || world.links.length >= 60} onClick={() => add('links', { name: '新通道', from: world.nodes[0].id, to: world.nodes[1].id, seconds: 5, capacity: 5 }, 'link')}>＋ 添加通道</button></div>
      {world.links.map((item, i) => <div className="sw-item" key={item.id}><div className="sw-heading"><button type="button" className="sw-item-toggle" aria-expanded={selected === item.id} onClick={() => setSelected(selected === item.id ? '' : item.id)}>{item.name}</button><span>{places.find(([id]) => id === item.from)?.[1]} ↔ {places.find(([id]) => id === item.to)?.[1]} · 容量 {item.capacity}</span></div>
        {selected === item.id && <div className="sw-item-content sw-fields"><Field label="通道名称" value={item.name} change={name => listEdit('links', i, { name })} /><Field label="通行耗时（秒）" type="number" value={item.seconds} change={seconds => listEdit('links', i, { seconds })} /><Select label="起点" value={item.from} options={places} change={from => listEdit('links', i, { from })} /><Select label="终点" value={item.to} options={places} change={to => listEdit('links', i, { to })} /><Field label="并行容量" type="number" value={item.capacity} change={capacity => listEdit('links', i, { capacity })} /><div><button type="button" onClick={() => change({ links: removeItem(world.links, i) })}>移除通道</button></div></div>}
      </div>)}
    </>}
    {tab === 'rules' && <><p className="sw-caption">规则按「触发 → 条件 → 动作」执行。要让人物移动，为角色添加移动或选路规则。</p><RuleEditor rules={world.rules} world={world} change={rules => change({ rules })} /></>}
    {tab === 'metrics' && <><h3>世界状态</h3><StateFields fields={world.state} change={state => change({ state })} /><div className="sw-heading"><h3>自定义指标</h3><button type="button" disabled={world.metrics.length >= 12} onClick={() => add('metrics', { name: '新指标', scope: 'person', kind: 'count', field: '' }, 'metric')}>＋ 添加指标</button></div>
      {world.metrics.map((item, i) => <div className="sw-item sw-fields" key={item.id}><Field label="指标名称" value={item.name} change={name => listEdit('metrics', i, { name })} /><Select label="统计对象" value={item.scope} options={scopeOptions} change={scope => listEdit('metrics', i, { scope })} /><Select label="统计方法" value={item.kind} options={ [['count','真值计数'],['sum','数值求和'],['average','数值平均']] } change={kind => listEdit('metrics', i, { kind })} /><Field label="字段标识" value={item.field} change={field => listEdit('metrics', i, { field })} /><div><button type="button" onClick={() => change({ metrics: removeItem(world.metrics, i) })}>移除指标</button></div></div>)}
    </>}
  </section>
}
function Attributes({ world, person, update }) {
  return <><div className="sw-fields">
    <Select label="起点" value={person.start} options={listOptions(world.nodes)} change={start => update({ start })} />
    <Select label="选路策略" value={person.policy} options={ [['shortest','最短路线'],['leastBusy','避开当前拥堵']] } change={policy => update({ policy })} />
    <Field label="移动速度（%）" value={person.speed} type="number" min={10} max={500} change={speed => update({ speed })} />
    <Field label="反应延迟（秒）" value={person.delay} type="number" min={0} max={600} change={delay => update({ delay })} />
  </div><Check label="需要协助（示例规则：移动速度减半）" value={person.assist} change={assist => update({ assist })} />
  <div className="sw-checks"><span>已知出口</span>{world.nodes.filter(node => node.exit).map(node => <Check key={node.id} label={node.name} value={person.known.includes(node.id)} change={on => update({ known: on ? [...person.known, node.id] : person.known.filter(id => id !== node.id) })} />)}</div></>
}
export function PeopleEditor({ world, change }) {
  const [tab, setTab] = useState('groups')
  const [roleId, setRole] = useState('')
  const [personId, setPerson] = useState('')
  const [count, setCount] = useState(5)
  const role = world.roles.find(role => role.id === roleId) ?? world.roles[0]
  const person = world.people.find(person => person.id === personId) ?? world.people[0]
  const roleIndex = world.roles.indexOf(role)
  const personIndex = world.people.indexOf(person)
  const personRole = world.roles.find(role => role.id === person?.role)
  const resolved = personRole ? { ...personRole, ...person } : null
  const editRole = patch => change({ roles: patchItem(world.roles, roleIndex, patch) })
  const editPerson = patch => change({ people: patchItem(world.people, personIndex, patch) })
  return <section className="sw-block" aria-label="人物配置">
    <div className="sw-heading"><h2>人物配置</h2><span>{world.roles.length} 个角色 · {world.people.length} 人</span></div>
    <div className="sw-subnav"><button type="button" aria-pressed={tab === 'groups'} onClick={() => setTab('groups')}>角色模板</button><button type="button" aria-pressed={tab === 'people'} onClick={() => setTab('people')}>个体名单</button></div>
    {tab === 'groups' && <>
      <div className="sw-row"><Select label="选择角色" value={role.id} options={listOptions(world.roles)} change={setRole} /><button type="button" disabled={world.roles.length >= 24} onClick={() => { const id = newId(world.roles, 'role'); change({ roles: [...world.roles, { id, name: '新角色', ...roleDefaults(world) }] }); setRole(id) }}>＋ 新建角色</button></div>
      <Field label="角色名称" value={role.name} change={name => editRole({ name })} /><Attributes world={world} person={role} update={editRole} />
      <details className="sw-manual"><summary>角色自定义属性</summary><StateFields fields={role.state} change={state => editRole({ state })} /></details>
      <div className="sw-row"><Field label="添加人数" type="number" value={count} min={1} max={500} change={setCount} /><button type="button" disabled={!Number.isInteger(count) || count < 1 || world.people.length + count > 500} onClick={() => { const people = addPeople(world.people, role, count); change({ people }); setPerson(people[world.people.length].id); setTab('people') }}>批量添加</button><button type="button" disabled={world.roles.length <= 1 || world.people.some(person => person.role === role.id) || world.rules.some(rule => rule.role === role.id)} onClick={() => change({ roles: removeItem(world.roles, roleIndex) })}>移除角色</button></div>
      <p className="sw-caption">角色模板的改动会应用到未单独覆盖的成员。移动方式由世界规则指定。</p>
    </>}
    {tab === 'people' && person && <>
      <Select label="选择人物" value={person.id} options={listOptions(world.people)} change={setPerson} />
      <div className="sw-fields"><Field label="人物名称" value={person.name} change={name => editPerson({ name })} /><Select label="所属角色" value={person.role} options={listOptions(world.roles)} change={role => editPerson({ role })} /></div>
      {resolved && <Attributes world={world} person={resolved} update={editPerson} />}
      <details className="sw-manual"><summary>个体自定义属性</summary><StateFields fields={person.state ?? {}} change={state => editPerson({ state })} /></details>
      <div className="sw-row"><button type="button" onClick={() => change({ people: world.people.map(item => item.id === person.id ? { id: item.id, name: item.name, role: item.role } : item) })}>恢复角色默认值</button><button type="button" disabled={world.people.length <= 1} onClick={() => change({ people: removeItem(world.people, personIndex) })}>移除人物</button></div>
    </>}
  </section>
}
export function ExperimentEditor({ config, change }) {
  const { world, forkAt, plans, baseline } = config
  const [active, setActive] = useState(baseline)
  const [seeds, setSeeds] = useState(config.seeds.join(', '))
  const plan = plans.find(item => item.id === active) ?? plans[0]
  const edit = patch => change({ plans: patchItem(plans, plans.indexOf(plan), patch) })
  function add(source) {
    const id = newId(plans, 'plan')
    change({ plans: [...plans, { id, name: source ? source.name.slice(0, 75) + ' 副本' : '方案 ' + (plans.length + 1), rules: source ? structuredClone(source.rules) : [] }] })
    setActive(id)
  }
  return <section className="sw-block" aria-label="实验方案"><div className="sw-heading"><h2>实验方案</h2><button type="button" disabled={plans.length >= 8} onClick={() => add()}>＋ 添加方案</button></div>
    <p className="sw-caption">所有方案从同一快照开始；种子相同的运行可以一一比较。</p>
    <div className="sw-fields"><Field label="分叉时刻（秒）" type="number" value={forkAt} min={0} max={world.duration - 1} change={forkAt => change({ forkAt })} /><Field label="随机种子（逗号分隔）" value={seeds} change={value => { setSeeds(value); change({ seeds: value.split(/[,，]/).map(item => /^\d+$/.test(item.trim()) ? Number(item.trim()) : null) }) }} /></div>
    <div className="sw-row"><Select label="编辑方案" options={listOptions(plans)} value={plan.id} change={setActive} /><button type="button" disabled={plans.length >= 8} onClick={() => add(plan)}>复制方案</button><button type="button" disabled={plans.length <= 1} onClick={() => { const next = plans.filter(item => item !== plan); change({ plans: next, baseline: baseline === plan.id ? next[0].id : baseline }); setActive(next[0].id) }}>移除方案</button></div>
    <div className="sw-row"><Field label="方案名称" value={plan.name} change={name => edit({ name })} /><label className="sw-radio"><input type="radio" checked={baseline === plan.id} onChange={() => change({ baseline: plan.id })} />设为基准</label></div>
    <RuleEditor key={plan.id} rules={plan.rules} world={world} earliest={forkAt} change={rules => edit({ rules })} />
  </section>
}
export function WorldResults({ report }) {
  const { config, result } = report
  const [choice, setChoice] = useState(result.baseline)
  const [seedIndex, setSeed] = useState(0)
  const [page, setPage] = useState(0)
  const [metricKey, setMetric] = useState('p90Time')
  const options = [...METRICS, ...config.world.metrics.map(item => ['custom.' + item.id, item.name, ''])]
  const metric = options.find(([id]) => id === metricKey)
  const plan = result.results.find(item => item.id === choice)
  const run = plan.runs[seedIndex]
  const maximum = Math.max(1, ...result.results.map(item => Math.abs(item.metrics[metricKey] ?? 0)))
  const labels = new Map([...config.world.nodes, ...config.world.links].map(item => [item.id, item.name]))
  return <section className="sw-block" aria-label="实验结果">
    <div className="sw-heading"><h2>实验结果</h2><button type="button" onClick={() => downloadConfig('simworld-experiment', report)}>导出完整实验</button></div>
    <p className="sw-caption">{config.world.name} · 第 {result.forkAt} 秒分叉 · {config.seeds.length} 组种子 · 模拟结果取决于当前假设</p>
    <Select label="对比指标" value={metricKey} options={options.map(([id,label,unit]) => [id, label + (unit ? '（' + unit + '）' : '')])} change={setMetric} />
    <div className="sw-chart" aria-label={metric[1]}>{result.results.map(item => <div className="sw-bar-row" key={item.id}><span title={item.name}>{item.name}</span><div className="sw-track"><div className={item.id === result.baseline ? 'sw-bar sw-baseline' : 'sw-bar'} style={{ width: Math.abs(item.metrics[metricKey] ?? 0) / maximum * 100 + '%' }} /></div><strong>{shown(item.metrics[metricKey])}</strong></div>)}</div>
    <div className="sw-scroll"><table><thead><tr><th>方案 · 多次运行均值</th>{options.map(([id,label,unit]) => <th key={id}>{label}{unit && '（' + unit + '）'}</th>)}</tr></thead><tbody>{result.results.map(item => <tr key={item.id}><th scope="row">{item.name}{item.id === result.baseline && <small>基准</small>}</th>{options.map(([id]) => <td key={id}>{shown(item.metrics[id])}</td>)}</tr>)}</tbody></table></div>
    <h3>逐次运行 · {metric[1]}</h3>
    <div className="sw-scroll"><table><thead><tr><th>方案</th><th>种子</th><th>结果</th><th>相对同种子基准</th></tr></thead><tbody>{result.results.flatMap(item => item.runs.map(r => <tr key={item.id + '-' + r.seed}><th scope="row">{item.name}</th><td>{r.seed}</td><td>{shown(r.metrics[metricKey])}</td><td>{r.delta[metricKey] > 0 ? '+' : ''}{shown(r.delta[metricKey])}</td></tr>))}</tbody></table></div>
    <div className="sw-heading sw-divider"><h3>事件记录</h3><span>{run.events.length} 条{run.droppedEvents ? ' · 另有 ' + run.droppedEvents + ' 条超过记录上限' : ''}</span></div>
    <div className="sw-fields"><Select label="查看方案" options={listOptions(result.results)} value={choice} change={v => { setChoice(v); setPage(0) }} /><Select label="随机种子" options={plan.runs.map((r,i) => [String(i), r.seed])} value={String(seedIndex)} change={v => { setSeed(Number(v)); setPage(0) }} /></div>
    {run.events.length ? <div className="sw-scroll"><table><thead><tr><th>秒</th><th>人物</th><th>动作</th><th>详情</th></tr></thead><tbody>{run.events.slice(page * 20, (page + 1) * 20).map((event,i) => <tr key={i}><td>{event.time}</td><td>{event.name}</td><td>{actions[event.action] ?? event.action}</td><td>{event.detail.split(' → ').map(id => labels.get(id) ?? id).join(' → ')}</td></tr>)}</tbody></table></div> : <p className="sw-caption">这个方案没有产生事件。</p>}
    {run.events.length > 20 && <div className="sw-pages"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button><span>{page + 1} / {Math.ceil(run.events.length / 20)}</span><button type="button" disabled={(page + 1) * 20 >= run.events.length} onClick={() => setPage(page + 1)}>下一页</button></div>}
    <details className="sw-manual"><summary>按角色查看撤离时间分布</summary>{run.groups.map(group => <div className="sw-item" key={group.role}><strong>{group.name} · {group.evacuated}/{group.total} 人撤离</strong><p className="sw-caption">{group.times.length ? group.times.join('、') + ' 秒' : '暂无撤离记录'}</p></div>)}</details>
  </section>
}
export function WorldDraftAssistant({ apply }) {
  const [catalog, setCatalog] = useState(null)
  const [model, setModel] = useState('')
  const [request, setRequest] = useState('')
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function task(fn) {
    setBusy(true); setError('')
    try { await fn() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <section className="sw-block"><h2>AI 草稿</h2><p className="sw-caption">用一句话描述世界。应用前可以预览，应用后可逐项修改。</p>
    <label className="sw-field">世界描述<textarea rows="3" maxLength={3000} value={request} onChange={e => { setRequest(e.target.value); setDraft(null) }} disabled={busy} placeholder="例如：两栋教学楼、三个出口，比较关闭一个出口后何时广播" /></label>
    {catalog?.length ? <Select label="DSH 模型" value={model} options={ [['','请选择'], ...catalog.map((item,i) => [String(i), item.label + ' · ' + item.provider])] } change={setModel} /> :
      <button type="button" disabled={busy} onClick={() => task(async () => { const models = await post('models', {}); setCatalog(models); if (models.length === 1) setModel('0') })}>加载 DSH 模型</button>}
    {catalog?.length === 0 && <p className="sw-caption">请先在 DSH 设置中启用模型。</p>}
    <button type="button" disabled={busy || model === '' || !request.trim()} onClick={() => task(async () => { setDraft(null); const { provider, model: name } = catalog[Number(model)]; setDraft(await post('world-draft', { provider, model: name, request })) })}>{busy ? '处理中…' : '生成草稿'}</button>
    {error && <p role="alert" className="sw-error">{error}</p>}
    {draft && <div className="sw-item sw-stack"><strong>{draft.config.world.name}</strong><p className="sw-caption">{draft.config.world.nodes.length} 个地点 · {draft.config.world.people.length} 人 · {draft.config.world.rules.length} 条规则</p>{draft.notes.map((note,i) => <p key={i} className="sw-caption">{note}</p>)}<details><summary>查看完整配置</summary><pre>{JSON.stringify(draft.config, null, 2)}</pre></details><button type="button" onClick={() => apply(draft.config)}>应用为新草稿</button></div>}
  </section>
}
