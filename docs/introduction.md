# GitHub Trend Tracker — 项目介绍

## 一句话

**GitHub Trend Tracker** 是一个开源情报工具，自动抓取 GitHub Trending 和按 Topic 发现优质仓库，并提供 Web / CLI / Electron 三种交互界面。

## 它能做什么

- **每日情报采集** — 自动抓取 GitHub Trending（日/周/月），记录仓库名称、描述、语言、Star 数、Fork 数
- **话题级探索** — 通过 70+ 预定义热门话题（AI、Rust、React、Kubernetes...）批量搜索高质量开源项目
- **趋势分析** — 基于历史数据生成持续上榜仓库排名、语言分布图
- **多端访问** — 浏览器仪表盘、终端 CLI、桌面应用，随时随地查看

## 适用场景

| 角色 | 用途 |
|------|------|
| 开发者 | 发现优质学习资源、跟踪技术趋势 |
| 技术管理者 | 了解社区方向、做技术选型参考 |
| 开源爱好者 | 找到活跃项目、发现有潜力的新项目 |
| AI 研究员 | 追踪 LLM / 机器学习领域的最新开源成果 |

## 核心优势

- **轻量** — 无外部数据库，纯 JSON 文件存储
- **灵活** — 三种界面满足不同使用习惯
- **可离线** — 本地缓存 + JSON 存储，支持断网查阅历史数据
- **零配置启动** — `npm install && npm start` 即可运行

## 技术亮点

- 使用 **cheerio** 解析 GitHub Trending 页面，提取结构化数据
- 使用 **Octokit** 调用 GitHub Search API，按 Topics / Stars / 时间组合查询
- 内置 **TTL 缓存层**，避免重复请求触发 API 限流
- 三种 UI 模式（CLI 风格、TUI 仪表盘、Electron 桌面）共享同一套数据源
- Electron 版本内嵌 HTTP 服务，通过 `localhost` 加载 UI

## 快速上手

```bash
npm install              # 安装依赖
npm start                # 启动 Web UI → http://localhost:3456
npm run scan             # 一键全量扫描
npm run report           # 查看趋势报告
```

---

> 献给每一个在开源世界里探索的超级个体。
