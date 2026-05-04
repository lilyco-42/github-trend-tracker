/**
 * GitHub Trend Tracker — Electron Main Process
 * 内嵌 HTTP 服务器，打开原生桌面窗口
 */

import pkg from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import fs from 'fs';

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ===== 内嵌 HTTP Server =====
let server;
let tray;
let mainWindow;

function startServer(port = 3456) {
  return new Promise((resolve, reject) => {
    // Import the server modules
    import('../src/tracker.js').then(tracker => {
      import('../src/scraper.js').then(scraper => {
        import('../src/api.js').then(api => {
          const { scrapeTrending } = scraper;
          const { searchByTopic, searchRecentByTopic, batchSearchTopics, POPULAR_TOPICS } = api;
          const { saveTrendingSnapshot, saveTopicsSnapshot, generateReport, getCache, writeCache } = tracker;

          const PUBLIC_DIR = path.resolve(ROOT, 'public');
          const MIME = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'text/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
            '.ico': 'image/x-icon',
            '.svg': 'image/svg+xml',
          };

          const routes = {
            async 'GET /api/trending'(url) {
              const since = url.searchParams.get('since') || 'daily';
              const language = url.searchParams.get('language') || '';
              const cacheKey = `trending:${since}:${language}`;
              const cached = getCache(cacheKey);
              if (cached) return cached;
              const repos = await scrapeTrending(since, language);
              writeCache(cacheKey, repos, 15);
              saveTrendingSnapshot(repos, since);
              return repos;
            },
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
            async 'GET /api/topics/batch'() {
              const cached = getCache('topics:batch');
              if (cached) return cached;
              const results = await batchSearchTopics(POPULAR_TOPICS, { minStars: 300 });
              saveTopicsSnapshot(results);
              writeCache('topics:batch', results, 60);
              return results;
            },
            'GET /api/topics/list'() { return POPULAR_TOPICS; },
            'GET /api/report'() { return generateReport(); },
            async 'GET /api/scan'() {
              const trending = await scrapeTrending('daily');
              saveTrendingSnapshot(trending);
              const topics = await batchSearchTopics(POPULAR_TOPICS.slice(0, 10), { minStars: 300 });
              saveTopicsSnapshot(topics);
              return { trending: trending.length, topics: Object.keys(topics).length };
            },
          };

          server = http.createServer(async (req, res) => {
            try {
              const url = new URL(req.url, `http://localhost:${port}`);
              const routeKey = `${req.method} ${url.pathname}`;
              const handler = routes[routeKey];

              if (handler) {
                const data = await handler(url);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(data));
              } else if (url.pathname === '/') {
                let html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf-8');
                // Inject Electron flag for enhanced UI
                html = html.replace('</head>',
                  '<script>window.__ELECTRON__=true</script></head>');
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(html);
              } else {
                const filePath = path.join(PUBLIC_DIR, url.pathname);
                if (fs.existsSync(filePath)) {
                  const ext = path.extname(filePath);
                  const data = fs.readFileSync(filePath);
                  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
                  res.end(data);
                } else {
                  res.writeHead(404, { 'Content-Type': 'text/plain' });
                  res.end('Not Found');
                }
              }
            } catch (err) {
              const status = err.status || 500;
              const message = err.message || 'Internal Error';
              console.error(`[Error] ${status} ${message}`);
              res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: message }));
            }
          });

          server.listen(port, () => {
            console.log(`[Electron] HTTP server running on http://localhost:${port}`);
            resolve(port);
          });
        });
      });
    }).catch(reject);
  });
}

// ===== Window =====
async function createWindow() {
  const port = await startServer(3456);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'GitHub Trend Tracker',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadURL(`http://localhost:${port}`);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ===== Tray =====
function createTray() {
  const iconSize = process.platform === 'darwin' ? 16 : 24;
  // Create a simple colored icon programmatically
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('GitHub Trend Tracker');

  const contextMenu = Menu.buildFromTemplate([
    { label: '打开窗口', click: () => { if (mainWindow) mainWindow.show(); else createWindow(); } },
    { type: 'separator' },
    { label: '退出', click: () => { app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { if (mainWindow) mainWindow.show(); });
}

// ===== App Lifecycle =====
app.whenReady().then(async () => {
  // Set app name for menu bar
  app.name = 'GitHub Tracker';

  await createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (server) {
    server.close();
    console.log('[Electron] HTTP server stopped');
  }
});

// ===== IPC =====
ipcMain.handle('get-app-info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  electronVersion: process.versions.electron,
  dataPath: app.getPath('userData'),
}));
