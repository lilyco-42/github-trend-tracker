/**
 * Trend Tracker — 趋势追踪与数据管理
 * 底层使用 SQLite 持久化存储
 */
import { saveTrending as dbSaveTrending, saveTopics as dbSaveTopics, cacheGet, cacheSet, generateReport as dbGenerateReport } from './db.js';

/**
 * 保存当日 Trending 快照 → SQLite
 */
export function saveTrendingSnapshot(repos, since = 'daily') {
  const date = new Date().toISOString().split('T')[0];
  dbSaveTrending(date, since, repos);
  console.log(`[Tracker] Saved ${repos.length} repos to trending history (${date})`);
}

/**
 * 保存 Topic 搜索结果 → SQLite
 */
export function saveTopicsSnapshot(topicResults) {
  const date = new Date().toISOString().split('T')[0];
  let total = 0;
  for (const [topic, repos] of Object.entries(topicResults)) {
    if (repos.length > 0) {
      dbSaveTopics(topic, date, repos);
      total += repos.length;
    }
  }
  console.log(`[Tracker] Saved ${total} repos across ${Object.keys(topicResults).length} topics`);
}

/**
 * 读取缓存
 */
export { cacheGet as getCache };

/**
 * 写入缓存（带 TTL）
 */
export { cacheSet as writeCache };

/**
 * 生成趋势对比报告 → SQLite
 */
export function generateReport() {
  return dbGenerateReport(14);
}
