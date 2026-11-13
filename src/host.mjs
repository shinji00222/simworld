import { runComparison } from './core.mjs'

export { runComparison }
export const name = 'dsh-plugin-simworld'
export const inject = ['webServer']

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: '/simworld/run',
    async handler(req, res) {
      const json = (status, value) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify(value))
      }
      if (req.method !== 'POST') return json(405, { error: '仅支持 POST' })
      if (req.headers['x-simworld-request'] !== '1' || req.headers['sec-fetch-site'] === 'cross-site') {
        return json(403, { error: '请求必须来自模拟实验室页面' })
      }
      const chunks = []
      let length = 0
      try {
        for await (const chunk of req) {
          length += chunk.length
          if (length <= 512000) chunks.push(chunk)
        }
        if (length > 512000) return json(413, { error: '实验配置过大' })
        const config = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        return json(200, runComparison(config))
      } catch (error) {
        return json(400, { error: error instanceof Error ? error.message : '实验运行失败' })
      }
    },
  }), 'simworld: experiment endpoint')
}
