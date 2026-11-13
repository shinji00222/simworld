export const scenes = {
  cafeteria: {
    name: '校园食堂', description: '比较午高峰的排队和服务方案',
    duration: ['模拟时长（分钟）', 60, 5, 240],
    settings: [['windows', '服务窗口', 2, 1, 30], ['service', '每人服务时间（分钟）', 3, 1, 30]],
    metrics: [['served', '已服务', '人'], ['wait', '平均等待', '分钟'], ['peak', '最长队列', '人'], ['left', '放弃排队', '人'], ['pending', '未完成', '人']],
    role: '顾客', templates: {
      '普通学生': { patience: 12, arrival: 0, speed: 100 },
      '赶课学生': { patience: 5, arrival: 0, speed: 80 },
      '耐心学生': { patience: 25, arrival: 0, speed: 115 },
    },
    traits: [['patience', '耐心上限（分钟）', 0, 240], ['speed', '点餐耗时系数（%）', 25, 300]],
    initial: [['arrival', '到达时刻（分钟）', 0, 239]],
    example: { name: '增开窗口', windows: 3 },
  },
  market: {
    name: '小型市场', description: '比较定价、进货对销量与利润的影响',
    duration: ['模拟时长（天）', 7, 1, 60],
    settings: [['price', '原价（元）', 100, 1, 100000], ['cost', '单位成本（元）', 65, 0, 100000], ['stock', '初始库存', 30, 0, 10000], ['discount', '降价幅度（%）', 0, 0, 100]],
    metrics: [['sales', '销量', '件'], ['profit', '利润', '元'], ['inventory', '剩余库存', '件'], ['missed', '缺货次数', '次']],
    role: '消费者', templates: {
      '普通消费者': { willingness: 100, budget: 115, frequency: 45 },
      '价格敏感型': { willingness: 90, budget: 100, frequency: 55 },
      '高意愿型': { willingness: 125, budget: 150, frequency: 70 },
    },
    traits: [['willingness', '最高愿付价格（元）', 0, 100000], ['frequency', '每天到访概率（%）', 0, 100]],
    initial: [['budget', '初始预算（元）', 0, 100000]],
    example: { name: '降价 10%', discount: 10 },
  },
}

export function defaultSettings(scene) {
  return Object.fromEntries(scenes[scene].settings.map(([key, , value]) => [key, value]))
}

export function makeAgents(scene, template, count, offset = 0) {
  const values = scenes[scene].templates[template]
  return Array.from({ length: count }, (_, index) => ({
    name: `${scenes[scene].role} ${offset + index + 1}`,
    template,
    ...values,
    ...(scene === 'cafeteria' ? { arrival: values.arrival + (offset + index) % 18 } : {}),
  }))
}

export function createDraft(scene) {
  const spec = scenes[scene]
  const templates = Object.keys(spec.templates)
  return {
    scene, sceneName: spec.name, duration: spec.duration[1], seed: 42, baseline: 1,
    agents: templates.flatMap((template, index) => makeAgents(scene, template, 8, index * 8)),
    scenarios: [
      { id: 1, name: '现状', ...defaultSettings(scene) },
      { id: 2, ...defaultSettings(scene), ...spec.example },
    ],
  }
}

