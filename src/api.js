/**
 * GitHub REST API 集成
 * 通过 GitHub Search API 按 Topic / Stars / Language 发现仓库
 */
import { Octokit } from '@octokit/rest';

let _octokit = null;

function getClient() {
  if (_octokit) return _octokit;
  _octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN || undefined,
  });
  return _octokit;
}

/**
 * 按 Topic 搜索热门仓库
 * @param {string} topic - GitHub topic 标签
 * @param {Object} [opts]
 * @param {number} [opts.minStars=100]
 * @param {string} [opts.sort='stars']
 * @param {number} [opts.perPage=30]
 * @returns {Promise<Array>}
 */
export async function searchByTopic(topic, opts = {}) {
  const {
    minStars = 100,
    sort = 'stars',
    perPage = 30,
    createdAfter = '',
  } = opts;

  let query = `topic:${topic} stars:>=${minStars}`;
  if (createdAfter) {
    query += ` created:>=${createdAfter}`;
  }

  const octokit = getClient();
  const result = await octokit.rest.search.repos({
    q: query,
    sort,
    order: 'desc',
    per_page: perPage,
  });

  return result.data.items.map(repo => ({
    id: repo.id,
    fullName: repo.full_name,
    description: repo.description,
    url: repo.html_url,
    topics: repo.topics,
    language: repo.language,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    openIssues: repo.open_issues_count,
    createdAt: repo.created_at,
    updatedAt: repo.updated_at,
    pushedAt: repo.pushed_at,
    license: repo.license?.spdx_id || null,
    owner: {
      login: repo.owner.login,
      avatar: repo.owner.avatar_url,
      type: repo.owner.type,
    },
  }));
}

/**
 * 搜索最新仓库（按创建时间，适合发现新项目）
 */
export async function searchRecentByTopic(topic, opts = {}) {
  const { minStars = 10, perPage = 30 } = opts;
  // 近 3 个月内创建的仓库
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const sinceDate = threeMonthsAgo.toISOString().split('T')[0];

  return searchByTopic(topic, {
    minStars,
    sort: 'stars',
    perPage,
    createdAfter: sinceDate,
  });
}

/**
 * 获取仓库详情（含 README 预览）
 */
export async function getRepoDetails(owner, name) {
  const octokit = getClient();

  const [repoRes, readmeRes] = await Promise.allSettled([
    octokit.rest.repos.get({ owner, repo: name }),
    octokit.rest.repos.getReadme({ owner, repo: name }),
  ]);

  const repo = repoRes.value?.data;
  let readmeContent = '';
  if (readmeRes.value?.data?.content) {
    readmeContent = Buffer.from(readmeRes.value.data.content, 'base64').toString('utf-8').slice(0, 2000);
  }

  return {
    fullName: repo.full_name,
    description: repo.description,
    topics: repo.topics,
    language: repo.language,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    openIssues: repo.open_issues_count,
    subscribers: repo.subscribers_count,
    createdAt: repo.created_at,
    updatedAt: repo.updated_at,
    license: repo.license?.spdx_id,
    readmePreview: readmeContent.slice(0, 500),
  };
}

/**
 * 获取 GitHub 上的所有 topic 列表（热门标签）
 * 注意：GitHub 没有官方的 topic 列表 API，这里返回常见推荐 topics
 */
export const POPULAR_TOPICS = [
  'ai', 'machine-learning', 'deep-learning', 'llm', 'artificial-intelligence',
  'rust', 'go', 'typescript', 'python', 'javascript',
  'react', 'nextjs', 'vue', 'svelte', 'solidjs',
  'tailwindcss', 'shadcn-ui', 'nodejs', 'deno', 'bun',
  'webassembly', 'wasm', 'kubernetes', 'docker', 'devops',
  'database', 'sql', 'nosql', 'postgresql', 'redis',
  'blockchain', 'web3', 'defi', 'nft', 'crypto',
  'game-development', 'graphics', '3d', 'animation',
  'testing', 'ci-cd', 'automation', 'monitoring',
  'mobile', 'flutter', 'react-native', 'kotlin', 'swift',
  'vim', 'neovim', 'editor', 'terminal', 'cli',
  'tutorial', 'awesome-list', 'book', 'course',
  'security', 'privacy', 'cryptography', 'penetration-testing',
  'data-science', 'data-visualization', 'analytics',
  'open-source', 'hacktoberfest', 'good-first-issue',
  'low-code', 'no-code', 'saas', 'startup',
];

/**
 * 批量搜索多个 Topic 的最新热门
 */
export async function batchSearchTopics(topics, opts = {}) {
  const results = {};
  for (const topic of topics.slice(0, 15)) { // 限 15 个防限流
    try {
      const repos = await searchByTopic(topic, { minStars: opts.minStars || 500, perPage: 10 });
      results[topic] = repos;
    } catch (err) {
      console.warn(`[${topic}] search failed:`, err.message);
      results[topic] = [];
    }
    // 速率限制：每次请求间隔 200ms
    await new Promise(r => setTimeout(r, 200));
  }
  return results;
}
