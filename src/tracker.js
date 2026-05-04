/**
 * Trend Tracker — 趋势追踪与历史数据管理
 * 将每日趋势快照保存到本地 JSON 文件，支持对比分析
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const TRENDING_FILE = path.join(DATA_DIR, 'trending-history.json');
const TOPICS_FILE = path.join(DATA_DIR, 'topics-snapshot.json');
const CACHE_FILE = path.join(DATA_DIR, 'cache.json');

// 确保 data 目录存在
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * 保存当日 Trending 快照
 */
export function saveTrendingSnapshot(repos, since = 'daily') {
  const dateKey = new Date().toISOString().split('T')[0];
  let history = {};

  // 读取已有历史
  if (fs.existsSync(TRENDING_FILE)) {
    try {
      history = JSON.parse(fs.readFileSync(TRENDING_FILE, 'utf-8'));
    } catch {}
  }

  if (!history[dateKey]) history[dateKey] = {};
  history[dateKey][since] = repos.map(r => ({
    fullName: r.fullName,
    description: r.description?.slice(0, 200) || '',
    language: r.language,
    totalStars: r.totalStars,
    todayStars: r.todayStars,
    forks: r.forks,
    url: r.url,
  }));

  fs.writeFileSync(TRENDING_FILE, JSON.stringify(history, null, 2));
  console.log(`[Tracker] Saved ${repos.length} repos to trending history (${dateKey})`);
  return history;
}

/**
 * 保存 Topic 搜索结果快照
 */
export function saveTopicsSnapshot(topicResults) {
  const data = {
    date: new Date().toISOString(),
    topics: topicResults,
  };
  fs.writeFileSync(TOPICS_FILE, JSON.stringify(data, null, 2));
  const count = Object.values(topicResults).flat().length;
  console.log(`[Tracker] Saved ${count} repos across ${Object.keys(topicResults).length} topics`);
  return data;
}

/**
 * 读取历史趋势数据
 */
export function getTrendingHistory(days = 7) {
  if (!fs.existsSync(TRENDING_FILE)) return [];
  const history = JSON.parse(fs.readFileSync(TRENDING_FILE, 'utf-8'));

  const dates = Object.keys(history).sort().slice(-days);
  return dates.map(date => ({ date, data: history[date] }));
}

/**
 * 获取 Topic 快照历史
 */
export function getTopicsSnapshot() {
  if (!fs.existsSync(TOPICS_FILE)) return null;
  return JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf-8'));
}

/**
 * 读取缓存
 */
export function readCache() {
  if (!fs.existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * 写入缓存（带 TTL）
 */
export function writeCache(key, data, ttlMinutes = 30) {
  const cache = readCache();
  cache[key] = {
    data,
    expiresAt: Date.now() + ttlMinutes * 60 * 1000,
  };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * 获取缓存（如果有效）
 */
export function getCache(key) {
  const cache = readCache();
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) return null;
  return entry.data;
}

/**
 * 生成趋势对比报告
 */
export function generateReport() {
  const history = getTrendingHistory(14);
  if (history.length === 0) return { message: '暂无数据，请先运行扫描' };

  // 统计所有出现过的仓库
  const repoStats = {};
  for (const day of history) {
    const sinceData = day.data?.daily || day.data || [];
    for (const repo of sinceData) {
      if (!repoStats[repo.fullName]) {
        repoStats[repo.fullName] = {
          fullName: repo.fullName,
          description: repo.description,
          language: repo.language,
          url: repo.url,
          appearances: 0,
          totalStarsPeak: 0,
          totalStarsLatest: 0,
          daysSeen: [],
        };
      }
      repoStats[repo.fullName].appearances++;
      repoStats[repo.fullName].totalStarsPeak = Math.max(
        repoStats[repo.fullName].totalStarsPeak,
        repo.totalStars || 0
      );
      repoStats[repo.fullName].totalStarsLatest = repo.totalStars || 0;
      repoStats[repo.fullName].daysSeen.push(day.date);
    }
  }

  // 按出现次数排序
  const sorted = Object.values(repoStats).sort((a, b) => b.appearances - a.appearances);

  const languages = {};
  for (const repo of sorted) {
    const lang = repo.language || 'Unknown';
    languages[lang] = (languages[lang] || 0) + 1;
  }

  return {
    reportDate: new Date().toISOString(),
    trackedDays: history.length,
    uniqueRepos: sorted.length,
    topTrending: sorted.slice(0, 30),
    languageDistribution: Object.entries(languages)
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count]) => ({ language: lang, count })),
  };
}
