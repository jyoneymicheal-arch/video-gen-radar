# 视频生成技术雷达 · Video Gen Radar

追踪 GitHub 近三个月活跃的**视频生成开源项目**，每天 08:00（Asia/Shanghai）自动更新。

数据全部来自 GitHub 公开 API，无人工编辑、无第三方数据源。

## 页面包含什么

| 模块 | 内容 |
| --- | --- |
| 今日速览 | 项目总数、热门榜/新星榜数量、深度解读条数、本次生成时间 |
| 每日技术速报 | 从过去 48h 真实 commit 中挑出 3 条最具信号量的变更，含技术方案、重要性判断与**证据边界** |
| 榜单视图 | 热门榜 / 新星榜 / 最新更新 / Star 总榜 / 全部项目 |
| 项目类型 | 生成模型·研究、训练/推理基础设施、理解·检索·评测、创作 Agent·Workflow、编辑·后期工具、开发工具·API、资源·方法、通用创作应用 |
| 应用场景 | 广告·电商、短剧·漫剧、社媒短视频、数字人·口播、影视·长视频、解说·知识视频 |
| 项目详情 | 点击任意行弹出：Stars/Forks/语言/今日新增、深度解读、风险提示、原始简介、topic 标签 |

顶部搜索框支持实时过滤（快捷键 `/` 聚焦），与当前榜单叠加生效。

## 入榜方法

- **热门**：≥3,000 Star、≥200 Fork，且 30 天内有代码推送
- **冲榜快**：单日新增 ≥60 Star，或新项目（≤120 天）日均增速 ≥40
- **高频迭代**：近 30 天提交数 ≥30
- **新生**：建库 ≤100 天且 ≥300 Star

**Star 日增量**由每日快照（`data/snapshots/*.json`）对比得出 —— 首次运行时没有基线，因此不显示增量；从第二天起开始出现。

## 数据流水线

```
scripts/fetch.mjs   → 26 组搜索查询 → 相关性过滤 → 分类打标 → data/repos.json + 每日快照
scripts/brief.mjs   → 扫描活跃仓库近 48h commit → 主题归类 + 打分 → data/brief.json
scripts/build.mjs   → 渲染静态站点 → dist/
```

相关性过滤（`scripts/lib/relevance.mjs`）会剔除设计工具、RAG 框架、下载器等相邻生态的噪音项目；
分类规则（`scripts/lib/classify.mjs`）使用加权关键词 + 反向惩罚，避免"用了 diffusion 就算模型仓库"这类误判。

## 本地运行

```bash
export GITHUB_TOKEN=$(gh auth token)   # 未授权时 API 限流会非常严格
npm run pipeline                       # fetch → brief → build
npm run serve                          # http://localhost:4173
```

单步执行：`npm run fetch` / `npm run brief` / `npm run build`

自动化验证（渲染 + 交互 + 布局溢出 + 控制台报错）：

```bash
npm run serve &
node scripts/verify.mjs
```

## 自动更新

`.github/workflows/daily.yml` 每天 00:00 UTC（= 北京时间 08:00）执行：
抓取数据 → 生成速报 → 构建站点 → 回写 `data/` → 部署到 GitHub Pages。

也可在 Actions 页面手动 **Run workflow** 立即触发一次。

## 说明

榜单用于技术趋势观察，不构成项目质量背书。深度解读与风险提示均由公开指标（Star / Fork / 提交时间 / issue / topic）推导，未对项目输出质量做实测评价。
