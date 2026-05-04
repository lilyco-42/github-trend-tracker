# GitHub Trend Tracker

> GitHub Trending & Topics Tracker — AI 时代超级个体的开源情报工具

实时追踪 GitHub 热门仓库与 Topic 趋势，提供 Web UI、CLI、Electron 桌面应用三种交互界面。

---

## 功能概览

| 功能 | 说明 |
|------|------|
| **Trending 抓取** | 爬取 github.com/trending 热门仓库（日/周/月） |
| **Topic 搜索** | 通过 GitHub Search API 按话题标签发现仓库 |
| **批量扫描** | 同时扫描 70+ 预定义热门话题 |
| **趋势报告** | 基于历史数据生成持续上榜仓库与语言分布分析 |
| **Web UI** | 内置 HTTP 服务器，三种视觉模式（CLI / TUI / Electron） |
| **Electron 桌面** | 原生桌面窗口 + 系统托盘 |
| **本地缓存** | JSON 文件持久化 + 带 TTL 的内存缓存，减少重复请求 |

## 快速开始

```bash
# 安装依赖
npm install

# 设置 GitHub Token（可选，提高 API 配额）
export GITHUB_TOKEN=your_github_token

# 启动 Web 服务 (默认 http://localhost:3456)
npm start

# 或者指定端口
npm run dev

# 命令行用法
npm run trending        # 抓取今日热门
npm run topics -- --batch   # 批量扫描话题
npm run report          # 生成趋势报告
```

## 架构

```
src/                    # 核心源码
├── scraper.js          # GitHub Trending 页面爬虫 (cheerio)
├── api.js              # GitHub REST API 封装 (Octokit)
├── tracker.js          # 趋势追踪 & 历史数据管理
├── index.js            # HTTP 服务端 + Web UI
└── cli.js              # 命令行界面

electron/               # Electron 桌面应用
├── main.js             # 主进程 (内嵌 HTTP 服务)
└── preload.js          # 预加载脚本 (安全桥接)

public/
└── index.html          # React SPA (三种 UI 模式)

data/                   # 本地数据存储
├── trending-history.json   # Trending 历史快照
├── topics-snapshot.json    # Topic 搜索快照
└── cache.json              # API 缓存 (带 TTL)
```

## API 接口

| 端点 | 说明 |
|------|------|
| `GET /api/trending?since=daily&language=` | 获取 GitHub Trending 仓库 |
| `GET /api/topics/search?topic=ai&min=500` | 按 Topic 搜索热门仓库 |
| `GET /api/topics/batch` | 批量扫描所有热门 Topic |
| `GET /api/topics/list` | 获取预定义 Topic 列表 |
| `GET /api/report` | 生成趋势分析报告 |
| `GET /api/scan` | 全量扫描（Trending + Topics） |

## CLI 命令

```bash
node src/cli.js trending                           # 抓取今日热门
node src/cli.js topics --topic ai --min 500        # 按 topic 搜索
node src/cli.js topics --recent --topic ai         # 搜索近 3 个月新项目
node src/cli.js topics --batch                     # 批量扫描
node src/cli.js report                             # 趋势报告
node src/cli.js scan                               # 全量扫描
```

## Electron 桌面应用

```bash
npx electron electron/main.js
```

- 原生窗口（1200×800），深色主题
- 系统托盘，后台运行
- 内嵌 HTTP 服务，渲染进程通过 `localhost:3456` 加载 UI

## 数据存储

所有数据以 JSON 文件保存在 `data/` 目录：

- **trending-history.json** — 按日期组织的每日趋势快照，支持历史对比
- **topics-snapshot.json** — 话题搜索的最新结果
- **cache.json** — API 响应缓存，默认 TTL 15-60 分钟

## 技术栈

| 层 | 技术 |
|----|------|
| 运行时 | Node.js (ESM) |
| Web 服务 | 原生 http 模块 |
| UI | React 18 (CDN + Babel) |
| 桌面 | Electron |
| 爬虫 | cheerio |
| API | @octokit/rest |
| 数据 | 本地 JSON 文件 |

## 预定义 Topics（70+）

覆盖 AI/ML、语言、框架、云原生、数据库、Web3、安全、移动端、工具等热门领域。

## License

MIT
