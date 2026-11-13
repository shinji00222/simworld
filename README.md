# SimWorld 模拟实验室

DeepSeek Harness 桌面端左侧栏的模拟实验插件。内置校园食堂和小型市场两个场景，支持自定义方案数量、选择基准、批量生成 Agent、逐个编辑人格和初始状态，以及查看方案指标和事件记录。

## 开发

```powershell
npm ci
npm test
npm run build
npm pack
```

在目标 profile 中用 `dsh plugin --profile desktop add file:<包的绝对路径>` 安装。重新打开 DSH，从左侧栏进入「模拟实验室」。本版针对 DSH 0.2.1-rc.5 开发。

## 模拟

方案共享初始 Agent。市场的到访随机数按种子重放，食堂使用固定到达时刻。食堂的平均等待时间仅统计已完成服务的人，未完成指标包含已到达且仍在等待或服务中的人。市场利润按实际成交单价减单位成本计算。

`src/core.mjs` 提供独立的 `runComparison(config)`。DSH 插件通过该函数运行实验。未来其他调用方可以复用相同的 JSON 输入输出。本版用规则驱动 Agent，实验结果取决于示例参数，页面草稿保留在当前面板内。
