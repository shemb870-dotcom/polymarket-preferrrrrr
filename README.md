# 使用与接手入口

- 日常使用和本地启动：[USER-GUIDE.md](USER-GUIDE.md)
- 内部结构与筛选逻辑：[ARCHITECTURE.md](ARCHITECTURE.md)
- UI 开源参考：[UI-SOURCES.md](UI-SOURCES.md)
- 本机双击 `启动事件镜.cmd` 启动。线上站点内点击“使用手册”。

# 事件镜 · Event Mirror

私人预测市场研究工作台，中文响应式界面。Vinext / React / Cloudflare D1。

## 已实现

- 演示与真实行情工作区隔离；6 个明确标记的虚构教学事件。
- Polymarket Gamma 公开二元市场接口、slug 添加、关注列表、价格变化及规则变化提醒。
- 页面可见时轮询，默认 120 秒；累计阈值默认 5 个百分点，保留基线，失败不伪造行情。
- 一手证据链接录入、YES/NO/背景分类、带时间戳且保留当时规则和证据的研究快照、JSON 导出。
- $100 模拟账户；每笔最多 $10，买入费按总支出 1%，卖出费按成交额 1%。不含真实资金。
- ChatGPT 登录、按用户和模式隔离的持久化数据、乐观并发检查，避免跨页面丢失更新。

## 必须知道

当前研究报告是可复核的结构化清单，不是已接入大模型的独立分析师。GitHub 技能安装在 Codex，网站不自动执行。没有经过校准的独立概率、自动新闻核实或盈利能力证明。

未接入钱包、实盘交易、订阅收费或后台外部通知。关闭页面后停止轮询。已关闭市场的模拟仓位不会自动按报价作结算，需未来增加经过核验的最终结果处理。

Gamma outcomePrices 是指示价格，不是盘口可执行价格。模拟未计真实点差、滑点、市场冲击和实际平台费率。没有真实数据时显示错误，绝不自动换成示例数据。

本机此前获取 Polymarket 返回 HTTP 451；程序明确显示并尊重访问限制。不同部署环境是否可以合法取得数据需在实际运行中确认，不保证可用性。

## 开发

Node >=22.13；`npm ci`，`npm run db:generate`（仅 schema 改变时），`npm run build`，`npm run dev`。

构建后本地 D1 初始化：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_wet_hiroim.sql
```

测试：`node --experimental-strip-types --test tests/*.test.ts`；类型检查：`node node_modules/typescript/bin/tsc --noEmit`。

Windows 的 Sites npm 批处理解析若失败，通过 npm 官方 `npm-cli.js` 入口执行；本地 `.sites-runtime/bin/npm.cmd` 是未提交的兼容入口。依赖文件沙箱读取报 EPERM 时需批准构建权限，而不是修改依赖。

Sites ID 已写入 `.openai/hosting.json`，不得重复创建站点。私人发布自动应用 schema migration。本地测试数据不会打包进部署。

## 数据规模

每工作区最多 150 市场、20 关注、每市场 100 条证据/100 研究快照、500 条提醒/500 笔模拟交易。最近 500 个价格变化点用于小图；约 1.8 MB JSON 上限。尚非多租户收费生产架构，应定期导出。
# v0.2 AI research update

AI research integration and opportunity scenario views are implemented. The owner has deferred API connection: **real model calls have not yet been verified**. See [AI-RESEARCH.md](./AI-RESEARCH.md) for configuration, automatic-mode limits, source checks, GitHub review, testing and known limitations. Older v0.1 notes below describe the original checklist mode, which remains available separately.

