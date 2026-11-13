export const ENGINE_VERSION = '1.0.0'
export const RULE_ACTIONS = {
  set: '设置状态', add: '增减数值', route: '沿路线移动', transfer: '移动到相邻地点',
  close: '关闭地点或通道', open: '开放地点或通道', inform: '通知角色', emit: '安排事件',
}
export const CONDITIONS = { eq: '等于', ne: '不等于', gt: '大于', gte: '大于等于', lt: '小于', lte: '小于等于' }
export const TRIGGERS = { tick: '每秒', time: '指定时间', event: '收到事件' }
const fail = (path, note = '无效') => { throw new Error(path + '：' + note) }
const key = value => typeof value === 'string' && /^[a-zA-Z][\w-]{0,39}$/.test(value) && !['constructor', 'prototype'].includes(value)
const scalar = value => typeof value === 'boolean' || (typeof value === 'string' && value.length <= 160) || (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e9)
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const own = (obj, id) => Object.hasOwn(obj, id) ? obj[id] : undefined
const integer = (value, lo, hi, path) => Number.isInteger(value) && value >= lo && value <= hi ? value : fail(path, '请输入 ' + lo + ' 到 ' + hi + ' 的整数')
const name = (value, path) => typeof value === 'string' && value.trim() && value.length <= 80 || fail(path, '请输入 1 到 80 个字符')
const list = (value, lo, hi, path) => Array.isArray(value) && value.length >= lo && value.length <= hi ? value : fail(path, '条目数应为 ' + lo + ' 到 ' + hi)
function fields(value, path) {
  if (!record(value) || Object.keys(value).length > 24 || Object.entries(value).some(([id, val]) => !key(id) || !scalar(val))) fail(path, '使用最多 24 个英文标识和文本、数字或布尔值')
}
function catalog(items, lo, hi, path) {
  const result = new Map()
  for (const [index, item] of list(items, lo, hi, path).entries()) {
    const label = path + ' #' + (index + 1)
    if (!key(item?.id) || result.has(item.id)) fail(label, '标识无效或重复')
    name(item.name, label)
    result.set(item.id, item)
  }
  return result
}

export function validateWorld(world) {
  if (world?.version !== 1) fail('世界配置', '仅支持版本 1')
  name(world.name, '世界名称')
  integer(world.duration, 1, 600, '时长')
  fields(world.state, '世界状态')
  const nodes = catalog(world.nodes, 1, 24, '地点')
  const links = catalog(world.links, 0, 60, '通道')
  for (const id of links.keys()) if (nodes.has(id)) fail('地点与通道', '标识不能重复')
  for (const node of nodes.values()) if (typeof node.exit !== 'boolean') fail(node.name, '缺少出口设置')
  for (const link of links.values()) {
    if (!nodes.has(link.from) || !nodes.has(link.to) || link.from === link.to) fail(link.name, '请选择两个不同地点')
    integer(link.seconds, 1, 120, link.name + ' 耗时')
    integer(link.capacity, 1, 500, link.name + ' 并行容量')
  }
  const roles = catalog(world.roles, 1, 24, '角色')
  const people = catalog(world.people, 1, 500, '人物')
  for (const role of roles.values()) {
    fields(role.state, role.name + ' 属性')
    if (!nodes.has(role.start)) fail(role.name, '起点不存在')
    integer(role.speed, 10, 500, role.name + ' 速度')
    integer(role.delay, 0, 600, role.name + ' 反应延迟')
    if (typeof role.assist !== 'boolean' || !['shortest', 'leastBusy'].includes(role.policy)) fail(role.name, '协助需求或策略无效')
    if (list(role.known, 0, 24, role.name + ' 已知出口').some(id => !nodes.get(id)?.exit)) fail(role.name, '只能选择存在的出口')
  }
  for (const person of people.values()) {
    if (!roles.has(person.role)) fail(person.name, '角色不存在')
    const merged = { ...roles.get(person.role), ...person }
    if (!nodes.has(merged.start)) fail(person.name, '起点不存在')
    integer(merged.speed, 10, 500, person.name + ' 速度')
    integer(merged.delay, 0, 600, person.name + ' 反应延迟')
    if (typeof merged.assist !== 'boolean' || !['shortest', 'leastBusy'].includes(merged.policy)) fail(person.name, '协助需求或策略无效')
    if (list(merged.known, 0, 24, person.name + ' 已知出口').some(id => !nodes.get(id)?.exit)) fail(person.name, '只能选择存在的出口')
    if (person.state !== undefined) fields(person.state, person.name + ' 属性')
  }
  function validRules(rules, path, earliest = 0) {
    for (const rule of catalog(rules, 0, 40, path).values()) {
      const label = path + ' / ' + rule.name
      if (!own(TRIGGERS, rule.trigger)) fail(label, '触发方式无效')
      if (rule.trigger === 'time') integer(rule.at, earliest, world.duration - 1, label + ' 时间')
      if (rule.trigger === 'event' && !key(rule.event)) fail(label, '事件标识无效')
      if (rule.role != null && !roles.has(rule.role)) fail(label, '角色不存在')
      if (!record(rule.action) || !own(RULE_ACTIONS, rule.action.kind)) fail(label, '动作无效')
      const { kind, target, value, delay } = rule.action
      if (['set', 'add'].includes(kind) && (!key(target) || !scalar(value) || (kind === 'add' && typeof value !== 'number'))) fail(label, '状态动作的字段或值无效')
      if (['set', 'add'].includes(kind) && rule.role == null && !Object.hasOwn(world.state, target)) fail(label, '请先声明世界状态字段')
      if (['close', 'open', 'inform'].includes(kind) && !nodes.has(target) && !links.has(target)) fail(label, '地点或通道不存在')
      if (kind === 'transfer' && !nodes.has(target)) fail(label, '目的地不存在')
      if (['close', 'open'].includes(kind) && rule.role != null) fail(label, '开放和关闭是世界动作')
      if (['route', 'transfer'].includes(kind) && rule.role == null) fail(label, '请为移动动作选择角色')
      if (kind === 'emit') {
        if (!key(target)) fail(label, '事件标识无效')
        integer(delay, 1, world.duration, label + ' 事件延迟')
      }
      if (rule.condition != null) {
        const c = rule.condition
        if (!['world', 'person'].includes(c.scope) || !key(c.field) || !own(CONDITIONS, c.op) || !scalar(c.value)) fail(label, '条件无效')
        if (c.scope === 'person' && rule.role == null) fail(label, '人物条件需要指定角色')
        if (c.scope === 'world' && !Object.hasOwn(world.state, c.field)) fail(label, '请先声明条件使用的世界状态字段')
      }
    }
  }
  validRules(world.rules, '世界规则')
  const metrics = catalog(world.metrics, 0, 12, '自定义指标')
  for (const metric of metrics.values()) {
    if (!['count', 'sum', 'average'].includes(metric.kind) || !key(metric.field) || !['world', 'person'].includes(metric.scope)) fail(metric.name, '指标定义无效')
    if (metric.scope === 'world' && !Object.hasOwn(world.state, metric.field)) fail(metric.name, '世界状态字段不存在')
  }
  return { nodes, links, roles, people, validRules }
}

export function validateExperiment(input) {
  const { world, plans, baseline, forkAt, seeds } = input ?? {}
  const index = validateWorld(world)
  integer(forkAt, 0, world.duration - 1, '分叉时间')
  const entries = catalog(plans, 1, 8, '方案')
  if (!entries.has(baseline)) fail('基准方案')
  for (const plan of entries.values()) index.validRules(plan.rules, plan.name, forkAt)
  list(seeds, 1, 12, '种子').forEach(seed => integer(seed, 0, 4294967295, '种子'))
  if (new Set(seeds).size !== seeds.length) fail('种子', '不能重复')
  const maxRules = Math.max(...plans.map(p => p.rules.length), 1) + world.rules.length
  if (world.duration * (world.people.length * maxRules + world.links.length * 4) * plans.length * seeds.length > 5000000) fail('实验规模', '请减少人数、时长、规则或种子')
  return index
}

function compare(value, op, other) {
  if (op === 'eq') return value === other
  if (op === 'ne') return value !== other
  if (typeof value !== 'number' || typeof other !== 'number') return false
  if (op === 'gt') return value > other
  if (op === 'gte') return value >= other
  if (op === 'lt') return value < other
  return value <= other
}

function random(state) {
  state.rng = (Math.imul(1664525, state.rng) + 1013904223) >>> 0
  return state.rng
}
function setup(world, index, seed) {
  const state = { time: 0, rng: seed, people: [], values: { ...world.state }, closed: {}, pending: [], events: [], peak: 0, dropped: 0 }
  state.people = world.people.map(person => {
    const role = index.roles.get(person.role)
    const config = { ...role, ...person }
    return {
      id: person.id, name: person.name, role: person.role, location: config.start, delay: config.delay,
      speed: config.speed, assist: config.assist, policy: config.policy, known: [...config.known],
      values: { ...role.state, ...person.state }, observed: {}, transit: null, evacuatedAt: null,
      tie: random(state), waitingSince: null,
    }
  })
  return state
}
function log(state, action, person, detail, rule) {
  if (state.events.length >= state.logLimit) { state.dropped++; return }
  state.events.push({ time: state.time, action, person: person?.id ?? null, name: person?.name ?? '世界', detail, rule })
}
function closed(state, id) { return own(state.closed, id) === true }
function observedClosed(person, id) { return own(person.observed, id) === true }
function accessible(link, from, to) { return link.from === from && link.to === to || link.to === from && link.from === to }
function route(person, edges, loads, locations) {
  const frontier = [{ node: person.location, cost: 0, first: null }]
  const seen = new Set()
  while (frontier.length) {
    frontier.sort((a, b) => a.cost - b.cost || a.node.localeCompare(b.node, 'en'))
    const { node, cost, first } = frontier.shift()
    if (seen.has(node)) continue
    seen.add(node)
    if (locations.get(node)?.exit && person.known.includes(node)) return first
    for (const link of edges.get(node) ?? []) {
      const to = link.from === node ? link.to : link.from
      if (seen.has(to) || observedClosed(person, to) || observedClosed(person, link.id)) continue
      const congestion = person.policy === 'leastBusy' && node === person.location ? (loads.get(link.id) ?? 0) * link.seconds / link.capacity : 0
      frontier.push({ node: to, first: first ?? { link, to }, cost: cost + link.seconds + congestion })
    }
  }
  return null
}

function simulate(state, rules, index, edges, end, horizon, logLimit) {
  state.logLimit = logLimit
  for (; state.time < end; state.time++) {
    const now = state.time
    const loads = new Map()
    for (const person of state.people) {
      if (!person.transit) continue
      if (person.transit.until > now) {
        const id = person.transit.link
        loads.set(id, (loads.get(id) ?? 0) + 1)
        continue
      }
      const { to, from } = person.transit
      person.location = to
      person.transit = null
      // An exit closed while the person was en route cannot count as a successful exit.
      if (index.nodes.get(to).exit) person.arrivedFrom = from
      log(state, 'arrive', person, to)
    }
    const due = new Set(state.pending.filter(event => event.at === now).map(event => event.id))
    state.pending = state.pending.filter(event => event.at > now)
    for (const id of due) log(state, 'event', null, id)
    const active = rules.filter(rule => rule.trigger === 'tick' || rule.trigger === 'time' && rule.at === now || rule.trigger === 'event' && due.has(rule.event))
    const people = [...state.people].sort((a, b) => (a.waitingSince ?? now) - (b.waitingSince ?? now) || a.tie - b.tie || a.id.localeCompare(b.id, 'en'))
    function apply(rule, person) {
      const c = rule.condition
      if (c && !compare(own(c.scope === 'world' ? state.values : person.values, c.field), c.op, c.value)) return
      const { kind, target, value, delay } = rule.action
      if (kind === 'close' || kind === 'open') {
        if (closed(state, target) === (kind === 'close')) return
        state.closed[target] = kind === 'close'
      } else if (kind === 'inform') {
        const listeners = person ? [person] : people
        let changed = false
        for (const listener of listeners) {
          if (listener.evacuatedAt !== null || own(listener.observed, target) === closed(state, target)) continue
          listener.observed[target] = closed(state, target)
          changed = true
        }
        if (!changed) return
      } else if (kind === 'emit') {
        if (now + delay >= horizon) return
        if (state.pending.some(event => event.at === now + delay && event.id === target)) return
        if (state.pending.length >= 2000) fail('事件队列', '事件数量超限')
        state.pending.push({ at: now + delay, id: target })
      } else if (kind === 'set' || kind === 'add') {
        const fields = person?.values ?? state.values
        const old = own(fields, target)
        const next = kind === 'set' ? value : (typeof old === 'number' ? old : 0) + value
        if (!scalar(next)) fail(rule.name, '状态值超出范围')
        if (!Object.hasOwn(fields, target) && Object.keys(fields).length >= 24) fail(rule.name, '状态字段超出上限')
        if (old === next) return
        fields[target] = next
      } else {
        if (person.transit || now < person.delay) return
        const next = kind === 'route' ? route(person, edges, loads, index.nodes)
          : { link: (edges.get(person.location) ?? []).find(edge => accessible(edge, person.location, target)), to: target }
        if (!next?.link) return
        const { link, to } = next
        if (closed(state, link.id) || closed(state, to)) {
          const blocked = closed(state, link.id) ? link.id : to
          if (!observedClosed(person, blocked)) log(state, 'blocked', person, blocked, rule.id)
          person.observed[blocked] = true
          return
        }
        const load = loads.get(link.id) ?? 0
        if (load >= link.capacity) {
          if (person.previousWait === null) log(state, 'queue', person, link.id, rule.id)
          person.waitingSince ??= person.previousWait ?? now
          return
        }
        person.waitingSince = null
        loads.set(link.id, load + 1)
        const speed = person.assist ? person.speed / 2 : person.speed
        person.transit = { link: link.id, from: person.location, to, until: now + Math.ceil(link.seconds * 100 / speed) }
        log(state, kind, person, link.id + ' → ' + to, rule.id)
        return
      }
      log(state, kind, person, target, rule.id)
    }
    for (const rule of active) if (rule.role == null && rule.action.kind !== 'inform') apply(rule, null)
    for (const rule of active) if (rule.role == null && rule.action.kind === 'inform') apply(rule, null)
    for (const person of people) {
      if (person.evacuatedAt !== null) continue
      if (!person.transit && index.nodes.get(person.location).exit) {
        if (!closed(state, person.location)) {
          person.evacuatedAt = now
          log(state, 'evacuate', person, person.location)
          continue
        }
        if (!observedClosed(person, person.location)) log(state, 'blocked', person, person.location)
        person.observed[person.location] = true
        if (person.arrivedFrom) person.location = person.arrivedFrom
      }
      person.previousWait = person.waitingSince
      person.waitingSince = null
      for (const rule of active) if (rule.role === person.role) apply(rule, person)
      delete person.previousWait
    }
    state.peak = Math.max(state.peak, people.filter(person => person.waitingSince !== null).length)
  }
}
const average = items => items.length ? items.reduce((a, b) => a + b, 0) / items.length : null
function summarize(state, world) {
  const evacuated = state.people.filter(person => person.evacuatedAt !== null)
  const times = evacuated.map(person => person.evacuatedAt).sort((a, b) => a - b)
  const metrics = {
    evacuated: times.length, pending: state.people.length - times.length,
    meanTime: average(times), p90Time: times[Math.ceil(times.length * 0.9) - 1] ?? null, peak: state.peak,
  }
  for (const metric of world.metrics) {
    const values = metric.scope === 'world' ? [own(state.values, metric.field)] : state.people.map(person => own(person.values, metric.field))
    const numbers = values.filter(value => typeof value === 'number')
    metrics['custom.' + metric.id] = metric.kind === 'count' ? values.filter(Boolean).length
      : metric.kind === 'sum' ? numbers.reduce((a, b) => a + b, 0) : average(numbers)
  }
  const groups = world.roles.map(role => {
    const members = state.people.filter(person => person.role === role.id)
    const times = members.flatMap(person => person.evacuatedAt === null ? [] : [person.evacuatedAt]).sort((a, b) => a - b)
    return { role: role.id, name: role.name, total: members.length, evacuated: times.length, times }
  })
  return { metrics, groups }
}

export function runExperiment(input) {
  const index = validateExperiment(input)
  const { world, plans, baseline, forkAt, seeds } = input
  const edges = new Map(world.nodes.map(node => [node.id, []]))
  for (const link of world.links) { edges.get(link.from).push(link); edges.get(link.to).push(link) }
  const results = plans.map(({ id, name }) => ({ id, name, runs: [] }))
  const logLimit = Math.min(4000, Math.floor(36000 / (plans.length * seeds.length)))
  for (const seed of seeds) {
    const shared = setup(world, index, seed)
    simulate(shared, world.rules, index, edges, forkAt, world.duration, logLimit)
    for (const [i, plan] of plans.entries()) {
      const state = structuredClone(shared)
      simulate(state, [...world.rules, ...plan.rules], index, edges, world.duration, world.duration, logLimit)
      results[i].runs.push({ seed, ...summarize(state, world), events: state.events, droppedEvents: state.dropped })
    }
  }
  const base = results.find(item => item.id === baseline)
  for (const plan of results) {
    plan.metrics = Object.fromEntries(Object.keys(plan.runs[0].metrics).map(key => [key, average(plan.runs.flatMap(run => run.metrics[key] === null ? [] : [run.metrics[key]]))]))
    for (const [i, run] of plan.runs.entries()) {
      run.delta = Object.fromEntries(Object.entries(run.metrics).map(([key, value]) => [key, value === null || base.runs[i].metrics[key] === null ? null : value - base.runs[i].metrics[key]]))
    }
  }
  return { engineVersion: ENGINE_VERSION, baseline, forkAt, results }
}
