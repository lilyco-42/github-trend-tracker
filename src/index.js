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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.argv.find(a => a.startsWith('--port='))?.split('=')[1]) || 3456;
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

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
};

// ===== HTTP Server =====
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const method = req.method;
    const routeKey = `${method} ${url.pathname}`;
    const handler = routes[routeKey];

    if (handler) {
      // API route
      const data = await handler(url);
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
