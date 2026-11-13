import { runExperiment } from './world.mjs'
import { configureWorld } from './world-configure.mjs'
import { configureAgents } from './configure.mjs'
import { runComparison } from './core.mjs'

export { runComparison, runExperiment }
export const name = 'dsh-plugin-simworld'
export const inject = ['webServer']

export function apply(ctx) {
  const endpoint = (path, run, needsModel = false) => ctx.webServer.register({
    kind: 'exact', path,
    async handler(req, res) {
      const json = (status, value) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify(value))
      }
      if (req.method !== 'POST') return json(405, { error: '仅支持 POST' })
      if (req.headers['x-simworld-request'] !== '1' || req.headers['sec-fetch-site'] === 'cross-site' || req.headers['sec-fetch-site'] === 'same-site') {
        return json(403, { error: '请求必须来自模拟实验室页面' })
      }
      const llm = needsModel ? ctx.get('llm') : undefined
      if (needsModel && !llm) return json(503, { error: '当前 DSH 环境没有可用的模型服务' })
      const chunks = []
      let length = 0
      try {
        for await (const chunk of req) {
          length += chunk.length
          if (length <= 512000) chunks.push(chunk)
        }
        if (length > 512000) return json(413, { error: '实验配置过大' })
        const config = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        return json(200, await run(config, llm))
      } catch (error) {
        return json(400, { error: error instanceof Error ? error.message : '请求失败' })
      }
    },
  })

  ctx.effect(() => endpoint('/simworld/experiment', runExperiment), 'simworld: custom experiment')
  ctx.effect(() => endpoint('/simworld/world-draft', (input, llm) => configureWorld(llm, input, AbortSignal.timeout(90000)), true), 'simworld: world draft')
  ctx.effect(() => endpoint('/simworld/run', runComparison), 'simworld: experiment endpoint')
  ctx.effect(() => endpoint('/simworld/models', async (_, llm) => {
    const catalogs = await Promise.allSettled(llm.listProviders().map(async provider => {
      const models = await llm.listModels(provider.id)
      return models.map(model => ({ provider: provider.id, model: model.id, label: model.name || model.id }))
    }))
    return catalogs.flatMap(result => result.status === 'fulfilled' ? result.value : [])
  }, true), 'simworld: configuration model catalog')
  ctx.effect(() => endpoint('/simworld/configure', (input, llm) => configureAgents(llm, input, AbortSignal.timeout(90000)), true), 'simworld: agent configuration')
}
