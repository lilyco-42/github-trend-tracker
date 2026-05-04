/**
 * GitHub Trend Tracker Server
 * Web UI + REST API 服务
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { scrapeTrending } from './scraper.js';
import { searchByTopic, searchRecentByTopic, batchSearchTopics, POPULAR_TOPICS } from './api.js';
import { saveTrendingSnapshot, saveTopicsSnapshot, generateReport, getCache, writeCache } from './tracker.js';
import { summarizeRepo, analyzeTrends, summarizeTopic, checkHealth, reloadConfig as reloadAiConfig } from './ai.js';
import { getStorageStats, getTrendingHistory, getTopicsHistory, getBookmarks, addBookmark, removeBookmark, getSearchHistory, saveSearch, settingGet, settingSet, settingDelete } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1]) || 3456;
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

// 从数据库加载持久化的 LM Studio 配置
try {
  const savedToken = settingGet('lm_token');
  const savedUrl = settingGet('lm_url');
  if (savedToken || savedUrl) {
    reloadAiConfig(savedToken, savedUrl);
  }
} catch {} // DB 不存在时忽略

// ===== MIME types =====
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

// ===== API Routes =====
const routes = {
  // GET /api/trending?since=daily&language=python
  async 'GET /api/trending'(url) {
    const since = url.searchParams.get('since') || 'daily';
    const language = url.searchParams.get('language') || '';
    const cacheKey = `trending:${since}:${language}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    const repos = await scrapeTrending(since, language);
    writeCache(cacheKey, repos, 15); // 15 分钟缓存
    saveTrendingSnapshot(repos, since);
    try { saveSearch('trending', `${since} ${language}`.trim(), repos.length); } catch {}
    return repos;
  },

  // GET /api/topics/search?topic=ai&min=500&recent=false
  async 'GET /api/topics/search'(url) {
    const topic = url.searchParams.get('topic');
    if (!topic) throw { status: 400, message: 'Missing topic parameter' };
    const minStars = parseInt(url.searchParams.get('min')) || 500;
    const isRecent = url.searchParams.get('recent') === 'true';
    const cacheKey = `topics:${topic}:${minStars}:${isRecent}`;
    const cached = getCache(cacheKey);
    if (cached) return cached;

    const searchFn = isRecent ? searchRecentByTopic : searchByTopic;
    const repos = await searchFn(topic, { minStars, perPage: 20 });
    writeCache(cacheKey, repos, 30);
    try { saveSearch('topic', topic, repos.length); } catch {}
    return repos;
  },

  // GET /api/topics/batch
  async 'GET /api/topics/batch'(url) {
    const cached = getCache('topics:batch');
    if (cached) return cached;

    const results = await batchSearchTopics(POPULAR_TOPICS, { minStars: 300 });
    saveTopicsSnapshot(results);
    writeCache('topics:batch', results, 60);
    return results;
  },

  // GET /api/topics/list
  'GET /api/topics/list'() {
    return POPULAR_TOPICS;
  },

  // GET /api/report
  'GET /api/report'() {
    return generateReport();
  },

  // GET /api/scan — 全量扫描
  async 'GET /api/scan'() {
    const trending = await scrapeTrending('daily');
    saveTrendingSnapshot(trending);
    const topics = await batchSearchTopics(POPULAR_TOPICS.slice(0, 10), { minStars: 300 });
    saveTopicsSnapshot(topics);
    return { trending: trending.length, topics: Object.keys(topics).length, repos: Object.values(topics).flat().length };
  },

  // ===== AI 分析 (LM Studio) =====
  'GET /api/ai/health': async () => ({ online: await checkHealth() }),

  'POST /api/ai/summarize-repo': async (url, body) => {
    if (!body?.repo) throw { status: 400, message: 'Missing repo data' };
    return { summary: await summarizeRepo(body.repo) };
  },

  'POST /api/ai/trend-insights': async (url, body) => {
    if (!body?.repos?.length) throw { status: 400, message: 'Missing repos' };
    return { insights: await analyzeTrends(body.repos) };
  },

  'POST /api/ai/topic-summary': async (url, body) => {
    if (!body?.topic || !body?.repos) throw { status: 400, message: 'Missing topic or repos' };
    return { summary: await summarizeTopic(body.topic, body.repos) };
  },

  // ===== 持久化存储 API (SQLite) =====
  'GET /api/db/stats': () => getStorageStats(),

  'GET /api/history/trending'(url) {
    const days = parseInt(url.searchParams.get('days')) || 7;
    return getTrendingHistory(days);
  },

  'GET /api/history/topics'(url) {
    const topic = url.searchParams.get('topic') || '';
    const days = parseInt(url.searchParams.get('days')) || 30;
    return getTopicsHistory(topic, days);
  },

  'GET /api/bookmarks'(url) {
    const tag = url.searchParams.get('tag') || '';
    return getBookmarks(tag);
  },

  'POST /api/bookmarks': async (url, body) => {
    if (!body?.fullName) throw { status: 400, message: 'Missing fullName' };
    addBookmark(body.fullName, body.reason || '', body.tags || '');
    return { ok: true };
  },

  'DELETE /api/bookmarks': async (url, body) => {
    if (!body?.fullName) throw { status: 400, message: 'Missing fullName' };
    removeBookmark(body.fullName);
    return { ok: true };
  },

  'GET /api/search-history'(url) {
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    return getSearchHistory(limit);
  },

  'POST /api/db/migrate': async () => {
    const { migrateFromJson } = await import('./db.js');
    const count = migrateFromJson();
    return { ok: true, migrated: count };
  },

  // ===== 设置 / Settings =====
  'GET /api/settings'() {
    const lmToken = settingGet('lm_token');
    const lmUrl = settingGet('lm_url');
    const lmModel = settingGet('lm_model');
    return {
      lm_configured: !!lmToken,
      lm_url: lmUrl || process.env.LMSTUDIO_URL || 'http://localhost:1234',
      lm_model: lmModel || process.env.LM_MODEL || 'qwen2.5-coder-7b-instruct',
    };
  },

  'POST /api/settings/lm'(url, body) {
    if (!body) throw { status: 400, message: 'Missing body' };
    let token, aiUrl, aiModel;
    if (body.token !== undefined) {
      if (body.token && typeof body.token !== 'string') throw { status: 400, message: 'Token must be a string' };
      if (body.token) {
        settingSet('lm_token', body.token);
        token = body.token;
      } else {
        settingDelete('lm_token');
        token = '';
      }
    }
    if (body.url !== undefined) {
      if (body.url && typeof body.url !== 'string') throw { status: 400, message: 'URL must be a string' };
      if (body.url) {
        try { new URL(body.url); } catch { throw { status: 400, message: 'Invalid URL format' }; }
        settingSet('lm_url', body.url);
        aiUrl = body.url;
      } else {
        settingDelete('lm_url');
        aiUrl = '';
      }
    }
    if (body.model !== undefined) {
      if (body.model && typeof body.model !== 'string') throw { status: 400, message: 'Model must be a string' };
      if (body.model) {
        settingSet('lm_model', body.model);
        aiModel = body.model;
      } else {
        settingDelete('lm_model');
        aiModel = '';
      }
    }
    // 运行时更新 AI 模块配置，无需重启
    reloadAiConfig(token, aiUrl, aiModel);
    return { ok: true };
  },
};

// ===== Read JSON body =====
function readBody(req) {
  return new Promise((resolve) => {
    if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'DELETE') return resolve(null);
    let data = '';
    req.on('data', (chunk) => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve(null); }
    });
  });
}

// ===== HTTP Server =====
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const routeKey = `${req.method} ${url.pathname}`;
    const handler = routes[routeKey];

    if (handler) {
      const body = await readBody(req);
      const data = await handler(url, body);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } else if (url.pathname === '/') {
      // Serve index.html
      const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else {
      // Static files
      const filePath = path.join(PUBLIC_DIR, url.pathname);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath);
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      }
    }
  } catch (err) {
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    console.error(`[Error] ${status} ${message}`);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: message }));
  }
});

function tryListen(port, maxRetries = 5) {
  server.listen(port, () => {
    console.log(`
╔══════════════════════════════════════════╗
║      GitHub Trend Tracker                ║
║      ─────────────────────               ║
║      Web UI:  http://localhost:${port}     ║
║      API:     http://localhost:${port}/api ║
╚══════════════════════════════════════════╝

  Endpoints:
    GET /api/trending?since=daily&language=  抓取热门
    GET /api/topics/search?topic=ai&min=500  按 Topic 搜索
    GET /api/topics/batch                     批量扫描
    GET /api/report                           趋势报告
    GET /api/db/stats                        存储统计
    GET /api/bookmarks                       书签列表 (POST/DELETE)
    GET /api/history/trending?days=7         Trending 历史
    POST /api/db/migrate                    从 JSON 迁移
`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && maxRetries > 0) {
      console.log(`[Server] Port ${port} in use, trying ${port + 1}...`);
      server.close();
      const newPort = port + 1;
      server.listen(newPort, () => {
        const p = server.address().port;
        console.log(`\n  → Server started on http://localhost:${p}`);
      });
      server.removeAllListeners('error');
    } else {
      console.error(`[Server] Failed to start: ${err.message}`);
      process.exit(1);
    }
  });
}

tryListen(PORT);
