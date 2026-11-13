import { scenes } from './scenes.mjs'

function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${label}须为 ${min} 到 ${max} 的整数`)
  }
}

function validate(config) {
  const { scene, seed, duration, agents, scenarios } = config ?? {}
  const spec = Object.hasOwn(scenes, scene) && scenes[scene]
  if (!spec) throw new Error('请选择有效场景')
  if (config.sceneName !== undefined && (typeof config.sceneName !== 'string' || config.sceneName.length > 80)) throw new Error('场景名称最多 80 字')
  integer(seed, 0, 4294967295, '随机种子')
  integer(duration, ...spec.duration.slice(2), spec.duration[0])
  if (!Array.isArray(agents) || agents.length < 1 || agents.length > 500) throw new Error('Agent 数量须在 1 到 500 之间')
  if (!Array.isArray(scenarios) || !scenarios.length) throw new Error('请至少添加一个方案')
  if (scenarios.length * agents.length * duration > 1000000) throw new Error('本次实验规模过大，请缩短时长或减少 Agent 数量')
  const ids = new Set()
  for (const agent of agents) {
    if (typeof agent?.name !== 'string' || !agent.name.trim() || agent.name.length > 80) throw new Error('请填写 Agent 名称（1 到 80 字）')
    for (const [key, label, min, max] of [...spec.traits, ...spec.initial]) integer(agent[key], min, max, label)
  }
  for (const scenario of scenarios) {
    if (!Number.isSafeInteger(scenario?.id) || ids.has(scenario.id)) throw new Error('方案编号无效或重复')
    ids.add(scenario.id)
    if (typeof scenario.name !== 'string' || !scenario.name.trim() || scenario.name.length > 80) throw new Error('请填写方案名称（1 到 80 字）')
    for (const [key, label, , min, max] of spec.settings) integer(scenario[key], min, max, label)
  }
  if (!ids.has(config.baseline)) throw new Error('请选择一个有效的基准方案')
}

function randomSource(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
    return seed / 4294967296
  }
}

function event(time, agent, action, detail) {
  return { time, agent: agent.name, action, detail }
}

function runCafeteria({ duration, agents }, plan) {
  const arrivals = agents.map((agent, index) => ({ agent, index })).sort((a, b) => a.agent.arrival - b.agent.arrival || a.index - b.index)
  const queue = []
  const windows = Array.from({ length: plan.windows }, () => null)
  const events = []
  let cursor = 0
  let served = 0
  let totalWait = 0
  let left = 0
  let peak = 0
  for (let minute = 0; minute <= duration; minute++) {
    for (const [index, job] of windows.entries()) {
      if (job?.ends === minute) {
        served++
        totalWait += job.wait
        events.push(event(minute, job.agent, '服务完成', `窗口 ${index + 1}，等待 ${job.wait} 分钟`))
        windows[index] = null
      }
    }
    if (minute === duration) break
    while (arrivals[cursor]?.agent.arrival === minute) {
      const { agent } = arrivals[cursor++]
      queue.push(agent)
      events.push(event(minute, agent, '加入队列', `队列位置 ${queue.length}`))
    }
    for (const [index, job] of windows.entries()) {
      if (job || !queue.length) continue
      const agent = queue.shift()
      const wait = minute - agent.arrival
      const ends = minute + Math.ceil(plan.service * agent.speed / 100)
      windows[index] = { agent, wait, ends }
      events.push(event(minute, agent, '开始服务', `窗口 ${index + 1}，等待 ${wait} 分钟`))
    }
    for (let index = 0; index < queue.length;) {
      const agent = queue[index]
      if (minute - agent.arrival >= agent.patience) {
        queue.splice(index, 1)
        left++
        events.push(event(minute, agent, '离开队列', `等待达到 ${agent.patience} 分钟`))
      } else index++
    }
    peak = Math.max(peak, queue.length)
  }
  return { metrics: { served, wait: served ? Math.round(totalWait / served * 100) / 100 : null, peak, left, pending: cursor - served - left }, events }
}

function runMarket({ duration, seed, agents }, plan) {
  const random = randomSource(seed)
  const priceCents = plan.price * (100 - plan.discount)
  const balances = agents.map(agent => agent.budget * 100)
  const events = []
  let inventory = plan.stock
  let missed = 0
  for (let day = 1; day <= duration; day++) {
    for (const [index, agent] of agents.entries()) {
      if (random() * 100 >= agent.frequency) continue
      if (priceCents > agent.willingness * 100 || priceCents > balances[index]) {
        events.push(event(day, agent, '未购买', `标价 ${priceCents / 100} 元，超过愿付价格或剩余预算`))
      } else if (!inventory) {
        missed++
        events.push(event(day, agent, '缺货', '无可用库存'))
      } else {
        inventory--
        balances[index] -= priceCents
        events.push(event(day, agent, '成交', `单价 ${priceCents / 100} 元，余额 ${balances[index] / 100} 元，库存 ${inventory} 件`))
      }
    }
  }
  const sales = plan.stock - inventory
  return { metrics: { sales, profit: sales * (priceCents - plan.cost * 100) / 100, inventory, missed }, events }
}

export function runComparison(config) {
  validate(config)
  const run = config.scene === 'cafeteria' ? runCafeteria : runMarket
  return {
    scene: config.scene, sceneName: config.sceneName?.trim() || scenes[config.scene].name, seed: config.seed, duration: config.duration, baseline: config.baseline,
    results: config.scenarios.map(plan => ({ id: plan.id, name: plan.name.trim(), ...run(config, plan) })),
  }
}
