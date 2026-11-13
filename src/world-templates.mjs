export const METRICS = [
  ['evacuated', '已撤离', '人'], ['pending', '未撤离', '人'], ['meanTime', '平均撤离时刻', '秒'],
  ['p90Time', 'P90 撤离时刻', '秒'], ['peak', '峰值等待人数', '人'],
]
export const newId = (items, prefix) => {
  let index = 1
  while (items.some(item => item.id === prefix + index)) index++
  return prefix + index
}
export function roleDefaults(world) {
  return { start: world.nodes[0]?.id ?? '', speed: 100, delay: 0, known: world.nodes.filter(node => node.exit).map(node => node.id), policy: 'shortest', assist: false, state: {} }
}
export function addPeople(people, role, count) {
  const next = [...people]
  for (let i = 0; i < count; i++) {
    const id = newId(next, 'person')
    next.push({ id, name: role.name + ' ' + id.slice(6), role: role.id })
  }
  return next
}
export function blankDraft() {
  const world = { version: 1, name: '未命名世界', duration: 60, state: {}, nodes: [{ id: 'start', name: '起点', exit: false }], links: [], roles: [], people: [], rules: [], metrics: [] }
  const role = { id: 'role1', name: '参与者', ...roleDefaults(world) }
  world.roles = [role]
  world.people = addPeople([], role, 1)
  return { world, forkAt: 0, baseline: 'base', seeds: [42], plans: [{ id: 'base', name: '基准方案', rules: [] }] }
}
const timed = (id, name, at, kind, target) => ({ id, name, trigger: 'time', at, action: { kind, target } })
export function evacuationDraft() {
  const config = blankDraft()
  const { world } = config
  world.name = '校园应急疏散'
  world.duration = 100
  world.nodes = [
    { id: 'room', name: '教学楼', exit: false }, { id: 'hall', name: '中央走廊', exit: false },
    { id: 'east', name: '东出口', exit: true }, { id: 'west', name: '西出口', exit: true },
  ]
  world.links = [
    { id: 'hallway', name: '教室走廊', from: 'room', to: 'hall', seconds: 6, capacity: 10 },
    { id: 'eastLink', name: '东侧通道', from: 'hall', to: 'east', seconds: 5, capacity: 3 },
    { id: 'westLink', name: '西侧通道', from: 'hall', to: 'west', seconds: 9, capacity: 5 },
  ]
  world.roles = [
    { id: 'familiar', name: '熟悉路线', ...roleDefaults(world), delay: 3 },
    { id: 'visitor', name: '访客', ...roleDefaults(world), delay: 6, policy: 'leastBusy' },
    { id: 'assisted', name: '需要协助', ...roleDefaults(world), delay: 6, assist: true },
  ]
  world.people = world.roles.reduce((people, role, i) => addPeople(people, role, [12, 14, 4][i]), [])
  world.rules = [
    timed('closeEast', '关闭东出口', 10, 'close', 'east'),
    ...world.roles.map(role => ({ id: 'route-' + role.id, name: role.name + '选路', trigger: 'tick', role: role.id, action: { kind: 'route' } })),
  ]
  return { ...config, forkAt: 10, seeds: [42, 43, 44], plans: [
    { id: 'base', name: '延迟通知', rules: [timed('lateNotice', '延迟广播', 22, 'inform', 'east')] },
    { id: 'early', name: '立即通知', rules: [timed('earlyNotice', '立即广播', 10, 'inform', 'east')] },
  ] }
}
