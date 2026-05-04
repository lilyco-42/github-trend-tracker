/**
 * CLI 命令行界面
 * 支持: trending / topics / report / scan
 *
 * 用法:
 *   node src/cli.js trending                     — 抓取今日热门
 *   node src/cli.js topics --topic ai --min 500  — 按 topic 搜索
 *   node src/cli.js topics --batch               — 批量搜索热门 topics
 *   node src/cli.js report                       — 生成趋势报告
 *   node src/cli.js scan                         — 全量扫描（trending + 热门 topics）
 */

import { scrapeTrending } from './scraper.js';
import { searchByTopic, searchRecentByTopic, POPULAR_TOPICS, batchSearchTopics } from './api.js';
import {
  saveTrendingSnapshot,
  saveTopicsSnapshot,
  generateReport,
  getTrendingHistory,
  getCache,
  writeCache,
} from './tracker.js';

function formatRepo(r) {
  const stars = r.totalStars?.toLocaleString() || r.stars?.toLocaleString() || '?';
  const lang = r.language || 'N/A';
  const desc = (r.description || '').slice(0, 80);
  return `  ⭐ ${stars.padStart(8)}  ${(r.fullName || '').padEnd(30)}  ${lang.padEnd(12)}  ${desc}`;
}

async function cmdTrending() {
  console.log('\n🔍 抓取 GitHub Trending...\n');
  const repos = await scrapeTrending('daily');
  saveTrendingSnapshot(repos);
  console.log(`\n📋 今日热门 (${repos.length}):\n`);
  repos.slice(0, 20).forEach(r => console.log(formatRepo(r)));
  console.log(`\n✅ 已保存到 data/trending-history.json`);
}

async function cmdTopics(args) {
  const topicIdx = args.indexOf('--topic');
  const topic = topicIdx !== -1 ? args[topicIdx + 1] : null;
  const minIdx = args.indexOf('--min');
  const minStars = minIdx !== -1 ? parseInt(args[minIdx + 1]) : 500;
  const isBatch = args.includes('--batch');
  const isRecent = args.includes('--recent');

  if (isBatch) {
    console.log(`\n🔍 批量扫描 ${POPULAR_TOPICS.length} 个热门 Topics...\n`);
    const results = await batchSearchTopics(POPULAR_TOPICS, { minStars });
    saveTopicsSnapshot(results);
    for (const [topic, repos] of Object.entries(results)) {
      if (repos.length > 0) {
        console.log(`  [${topic}] ${repos.length} repos`);
        repos.slice(0, 3).forEach(r => {
          console.log(`    ⭐ ${r.stars.toLocaleString().padStart(7)}  ${r.fullName}`);
        });
      }
    }
    const total = Object.values(results).flat().length;
    console.log(`\n✅ 共收录 ${total} 个仓库，覆盖 ${Object.keys(results).length} 个话题`);
    return;
  }

  if (!topic) {
    console.log('可用 Topics 列表:');
    POPULAR_TOPICS.forEach((t, i) => {
      process.stdout.write(`  ${t.padEnd(25)}`);
      if ((i + 1) % 3 === 0) console.log();
    });
    console.log('\n使用: node src/cli.js topics --topic <name> [--min 500] [--recent]');
    return;
  }

  console.log(`\n🔍 搜索 topic: "${topic}" (min ⭐${minStars})...`);
  const searchFn = isRecent ? searchRecentByTopic : searchByTopic;
  const repos = await searchFn(topic, { minStars, perPage: 20 });

  console.log(`\n📋 结果 (${repos.length}):\n`);
  repos.forEach(r => console.log(formatRepo(r)));
}

async function cmdReport() {
  console.log('\n📊 生成趋势报告...\n');
  const report = generateReport();
  if (report.message) {
    console.log(`  ${report.message}`);
    return;
  }
  console.log(`  追踪天数: ${report.trackedDays}`);
  console.log(`  独立仓库: ${report.uniqueRepos}`);
  console.log(`\n🏆 持续上榜 Top 10:\n`);
  report.topTrending.slice(0, 10).forEach((r, i) => {
    console.log(`  ${(i + 1).toString().padStart(2)}. ${r.fullName.padEnd(30)} 出现 ${r.appearances} 天  ⭐${r.totalStarsLatest.toLocaleString()}`);
  });
  console.log(`\n📊 语言分布:\n`);
  report.languageDistribution.slice(0, 10).forEach(({ language, count }) => {
    const bar = '█'.repeat(Math.min(count, 20));
    console.log(`  ${language.padEnd(12)} ${bar} ${count}`);
  });
  console.log(`\n✅ 报告完成`);
}

// ===== Main CLI =====
const cmd = process.argv[2] || 'help';

switch (cmd) {
  case 'trending':
    cmdTrending().catch(console.error);
    break;
  case 'topics':
    cmdTopics(process.argv.slice(3)).catch(console.error);
    break;
  case 'report':
    cmdReport().catch(console.error);
    break;
  case 'scan':
    Promise.all([
      cmdTrending(),
      cmdTopics(['--batch', '--min', '200']),
    ]).catch(console.error);
    break;
  default:
    console.log(`
  GitHub Trend Tracker CLI

  Usage:
    node src/cli.js trending             抓取今日 GitHub Trending
    node src/cli.js topics --list        列出可用 Topics
    node src/cli.js topics --topic <name> 按 Topic 搜索 (--min 500, --recent)
    node src/cli.js topics --batch       批量扫描所有热门 Topics
    node src/cli.js report               生成趋势报告
    node src/cli.js scan                 全量扫描
    `);
}
