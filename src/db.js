/**
 * SQLite 持久化存储
 * 替代 JSON 文件存储，提供结构化查询
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'tracker.db');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trending (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      since TEXT NOT NULL DEFAULT 'daily',
      full_name TEXT NOT NULL,
      description TEXT DEFAULT '',
      language TEXT DEFAULT '',
      total_stars INTEGER DEFAULT 0,
      today_stars INTEGER DEFAULT 0,
      forks INTEGER DEFAULT 0,
      url TEXT DEFAULT '',
      scraped_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(date, since, full_name)
    );

    CREATE TABLE IF NOT EXISTS topics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      date TEXT NOT NULL,
      full_name TEXT NOT NULL,
      description TEXT DEFAULT '',
      language TEXT DEFAULT '',
      stars INTEGER DEFAULT 0,
      forks INTEGER DEFAULT 0,
      url TEXT DEFAULT '',
      scraped_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      reason TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      UNIQUE(full_name)
    );

    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_type TEXT NOT NULL,
      query TEXT NOT NULL,
      result_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
}

// ===== Trending =====

export function saveTrending(date, since, repos) {
  const stmt = getDb().prepare(`
    INSERT OR REPLACE INTO trending (date, since, full_name, description, language, total_stars, today_stars, forks, url, scraped_at)
    VALUES (@date, @since, @fullName, @description, @language, @totalStars, @todayStars, @forks, @url, datetime('now','localtime'))
  `);

  const insertMany = getDb().transaction((items) => {
    for (const r of items) {
      stmt.run({
        date,
        since,
        fullName: r.fullName,
        description: (r.description || '').slice(0, 200),
        language: r.language || '',
        totalStars: r.totalStars || r.stars || 0,
        todayStars: r.todayStars || 0,
        forks: r.forks || 0,
        url: r.url || '',
      });
    }
  });

  insertMany(repos);
  console.log(`[DB] Saved ${repos.length} trending repos (${date}, ${since})`);
}

export function getTrendingHistory(days = 7) {
  const rows = getDb().prepare(`
    SELECT date, since, full_name, description, language, total_stars, today_stars, forks, url
    FROM trending
    WHERE date >= date('now', ? || ' days', 'localtime')
    ORDER BY date DESC, total_stars DESC
  `).all(`-${days}`);

  const mapRow = (r) => ({
    fullName: r.full_name,
    description: r.description,
    language: r.language,
    totalStars: r.total_stars,
    todayStars: r.today_stars,
    forks: r.forks,
    url: r.url,
    date: r.date,
    since: r.since,
  });

  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.date]) grouped[r.date] = {};
    if (!grouped[r.date][r.since]) grouped[r.date][r.since] = [];
    grouped[r.date][r.since].push(mapRow(r));
  }

  return Object.keys(grouped).sort().map(date => ({ date, data: grouped[date] }));
}

export function getLastTrendingDate() {
  const row = getDb().prepare(`SELECT date FROM trending ORDER BY date DESC LIMIT 1`).get();
  return row?.date || null;
}

// ===== Topics =====

export function saveTopics(topic, date, repos) {
  const stmt = getDb().prepare(`
    INSERT INTO topics (topic, date, full_name, description, language, stars, forks, url, scraped_at)
    VALUES (@topic, @date, @fullName, @description, @language, @stars, @forks, @url, datetime('now','localtime'))
  `);

  const insertMany = getDb().transaction((items) => {
    for (const r of items) {
      stmt.run({
        topic,
        date,
        fullName: r.fullName,
        description: (r.description || '').slice(0, 200),
        language: r.language || '',
        stars: r.stars || r.totalStars || 0,
        forks: r.forks || 0,
        url: r.url || '',
      });
    }
  });

  insertMany(repos);
}

export function getTopicsHistory(topic, days = 30) {
  return getDb().prepare(`
    SELECT * FROM topics
    WHERE topic = ? AND date >= date('now', ? || ' days', 'localtime')
    ORDER BY date DESC, stars DESC
  `).all(topic, `-${days}`);
}

export function getRecentTopics(days = 7) {
  return getDb().prepare(`
    SELECT DISTINCT topic FROM topics
    WHERE date >= date('now', ? || ' days', 'localtime')
    ORDER BY topic
  `).all(`-${days}`).map(r => r.topic);
}

// ===== Cache =====

export function cacheGet(key) {
  const row = getDb().prepare(`
    SELECT data FROM cache WHERE key = ? AND expires_at > ?
  `).get(key, Date.now());
  return row ? JSON.parse(row.data) : null;
}

export function cacheSet(key, data, ttlMinutes = 30) {
  getDb().prepare(`
    INSERT OR REPLACE INTO cache (key, data, expires_at)
    VALUES (?, ?, ?)
  `).run(key, JSON.stringify(data), Date.now() + ttlMinutes * 60 * 1000);
}

export function cacheClean() {
  const { changes } = getDb().prepare(`DELETE FROM cache WHERE expires_at <= ?`).run(Date.now());
  if (changes > 0) console.log(`[DB] Cleaned ${changes} expired cache entries`);
}

// ===== Settings（持久化配置）=====

export function settingGet(key) {
  const row = getDb().prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  return row?.value || null;
}

export function settingSet(key, value) {
  getDb().prepare(`
    INSERT OR REPLACE INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now','localtime'))
  `).run(key, value);
}

export function settingDelete(key) {
  getDb().prepare(`DELETE FROM settings WHERE key = ?`).run(key);
}

// ===== Bookmarks =====

export function addBookmark(fullName, reason = '', tags = '') {
  getDb().prepare(`
    INSERT OR REPLACE INTO bookmarks (full_name, reason, tags, created_at)
    VALUES (?, ?, ?, datetime('now','localtime'))
  `).run(fullName, reason, tags);
}

export function removeBookmark(fullName) {
  getDb().prepare(`DELETE FROM bookmarks WHERE full_name = ?`).run(fullName);
}

export function getBookmarks(tag = '') {
  if (tag) {
    return getDb().prepare(`
      SELECT * FROM bookmarks WHERE tags LIKE ? ORDER BY created_at DESC
    `).all(`%${tag}%`);
  }
  return getDb().prepare(`SELECT * FROM bookmarks ORDER BY created_at DESC`).all();
}

// ===== Search History =====

export function saveSearch(queryType, query, resultCount) {
  getDb().prepare(`
    INSERT INTO search_history (query_type, query, result_count, created_at)
    VALUES (?, ?, ?, datetime('now','localtime'))
  `).run(queryType, query, resultCount);
}

export function getSearchHistory(limit = 20) {
  return getDb().prepare(`
    SELECT * FROM search_history ORDER BY created_at DESC LIMIT ?
  `).all(limit);
}

// ===== Stats / Report =====

export function getStorageStats() {
  const tables = ['trending', 'topics', 'cache', 'bookmarks', 'search_history'];
  const stats = {};
  for (const t of tables) {
    const row = getDb().prepare(`SELECT COUNT(*) as count FROM ${t}`).get();
    stats[t] = row.count;
  }
  const lastTrending = getLastTrendingDate();
  const fileSize = fs.statSync(DB_PATH).size;
  return { ...stats, lastTrending, dbSize: fileSize, dbPath: DB_PATH };
}

export function generateReport(days = 14) {
  const rows = getDb().prepare(`
    SELECT date, full_name, description, language, total_stars, today_stars, forks, url
    FROM trending
    WHERE date >= date('now', ? || ' days', 'localtime')
    ORDER BY date DESC
  `).all(`-${days}`);

  if (rows.length === 0) return { message: '暂无数据，请先运行扫描' };

  const repoStats = {};
  for (const r of rows) {
    if (!repoStats[r.full_name]) {
      repoStats[r.full_name] = {
        fullName: r.full_name,
        description: r.description,
        language: r.language,
        url: r.url,
        appearances: 0,
        totalStarsPeak: 0,
        totalStarsLatest: 0,
        daysSeen: [],
      };
    }
    repoStats[r.full_name].appearances++;
    repoStats[r.full_name].totalStarsPeak = Math.max(
      repoStats[r.full_name].totalStarsPeak, r.total_stars
    );
    repoStats[r.full_name].totalStarsLatest = r.total_stars;
    if (!repoStats[r.full_name].daysSeen.includes(r.date)) {
      repoStats[r.full_name].daysSeen.push(r.date);
    }
  }

  const sorted = Object.values(repoStats).sort((a, b) => b.appearances - a.appearances);

  const languages = {};
  for (const repo of sorted) {
    const lang = repo.language || 'Unknown';
    languages[lang] = (languages[lang] || 0) + 1;
  }

  return {
    reportDate: new Date().toISOString(),
    trackedDays: new Set(rows.map(r => r.date)).size,
    uniqueRepos: sorted.length,
    topTrending: sorted.slice(0, 30),
    languageDistribution: Object.entries(languages)
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count]) => ({ language: lang, count })),
  };
}

// Auto-clean expired cache every hour
setInterval(() => { try { cacheClean(); } catch {} }, 3600000);

/**
 * 从旧 JSON 文件迁移数据到 SQLite
 */
export function migrateFromJson() {
  const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  const trendingFile = path.join(DATA_DIR, 'trending-history.json');
  const topicsFile = path.join(DATA_DIR, 'topics-snapshot.json');

  let migrated = 0;

  if (fs.existsSync(trendingFile)) {
    try {
      const history = JSON.parse(fs.readFileSync(trendingFile, 'utf-8'));
      const stmt = getDb().prepare(`
        INSERT OR IGNORE INTO trending (date, since, full_name, description, language, total_stars, today_stars, forks, url)
        VALUES (@date, @since, @fullName, @description, @language, @totalStars, @todayStars, @forks, @url)
      `);
      for (const [date, sinceData] of Object.entries(history)) {
        for (const [since, repos] of Object.entries(sinceData)) {
          for (const r of repos) {
            stmt.run({ date, since, fullName: r.fullName, description: (r.description || '').slice(0, 200), language: r.language || '', totalStars: r.totalStars || 0, todayStars: r.todayStars || 0, forks: r.forks || 0, url: r.url || '' });
            migrated++;
          }
        }
      }
      console.log(`[DB] Migrated ${migrated} trending records from JSON`);
    } catch (err) {
      console.warn(`[DB] Trending JSON migration failed: ${err.message}`);
    }
  }

  if (fs.existsSync(topicsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(topicsFile, 'utf-8'));
      const date = data.date?.split('T')[0] || new Date().toISOString().split('T')[0];
      const stmt = getDb().prepare(`INSERT INTO topics (topic, date, full_name, description, language, stars, forks, url) VALUES (@topic, @date, @fullName, @description, @language, @stars, @forks, @url)`);
      let count = 0;
      for (const [topic, repos] of Object.entries(data.topics || {})) {
        for (const r of repos) {
          stmt.run({ topic, date, fullName: r.fullName, description: (r.description || '').slice(0, 200), language: r.language || '', stars: r.stars || r.totalStars || 0, forks: r.forks || 0, url: r.url || '' });
          count++;
        }
      }
      console.log(`[DB] Migrated ${count} topic records from JSON`);
    } catch (err) {
      console.warn(`[DB] Topics JSON migration failed: ${err.message}`);
    }
  }

  return migrated;
}
