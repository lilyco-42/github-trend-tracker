/**
 * GitHub Trending Scraper
 * 抓取 github.com/trending 页面获取当日热门仓库
 * 自动回退到 GitHub Search API（当 gh trending 不可达时）
 */
import * as cheerio from 'cheerio';

const TRENDING_URL = 'https://github.com/trending';
const API_BASE = 'https://api.github.com';

/**
 * 直连失败时通过 Search API 获取近似 trending 数据
 */
async function fallbackSearch(since = 'daily', language = '') {
  const now = new Date();
  let daysBack;
  if (since === 'daily') daysBack = 7;
  else if (since === 'weekly') daysBack = 30;
  else daysBack = 90;

  const sinceDate = new Date(now - daysBack * 86400000).toISOString().split('T')[0];
  let query = `created:>=${sinceDate} stars:>=${since === 'monthly' ? 200 : 50}`;
  if (language) query += `+language:${language}`;

  const res = await fetch(
    `${API_BASE}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=25`,
    {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'github-tracker/2.0' },
      signal: AbortSignal.timeout(10000),
    }
  );
  if (!res.ok) throw new Error(`Search API fallback failed: ${res.status}`);
  const data = await res.json();

  return (data.items || []).map(repo => ({
    owner: repo.owner?.login || '',
    name: repo.name || '',
    fullName: repo.full_name || '',
    description: repo.description || '',
    language: repo.language || '',
    totalStars: repo.stargazers_count || 0,
    todayStars: 0, // Search API 无今日新增数据
    forks: repo.forks_count || 0,
    todayForks: 0,
    builders: [],
    url: repo.html_url || '',
    scrapedAt: new Date().toISOString(),
    since,
  }));
}

/**
 * 抓取 GitHub Trending 仓库列表
 * @param {string} since - daily | weekly | monthly
 * @param {string} language - 编程语言筛选 (optional)
 * @returns {Array<Object>}
 */
export async function scrapeTrending(since = 'daily', language = '') {
  const url = language
    ? `${TRENDING_URL}/${language}?since=${since}`
    : `${TRENDING_URL}?since=${since}`;

  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.warn(`[scraper] github.com/trending unreachable, falling back to Search API`);
    return fallbackSearch(since, language);
  }

  if (!res.ok) {
    console.warn(`[scraper] github.com/trending status ${res.status}, falling back to Search API`);
    return fallbackSearch(since, language);
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  const repos = [];

  $('article.Box-row').each((i, el) => {
    const $el = $(el);

    // 仓库名: owner/name
    const titleEl = $el.find('h2.h3 a');
    const href = titleEl.attr('href')?.replace(/^\//, '') || '';
    const [owner, name] = href.split('/');

    // 描述
    const description = $el.find('p.col-9').text().trim();

    // 编程语言
    const langEl = $el.find('[itemprop="programmingLanguage"]');
    const language = langEl.length ? langEl.text().trim() : '';

    // Stars (今日新增)
    const starText = $el.find('.float-sm-right').text().trim();
    const todayStars = parseInt(starText.replace(/[^0-9]/g, '')) || 0;

    // 总 Stars
    const totalStarsText = $el.find(`a[href="/${href}/stargazers"]`).text().trim();
    const totalStars = parseInt(totalStarsText.replace(/[^0-9]/g, '')) || 0;

    // Forks
    const forksText = $el.find(`a[href="/${href}/forks"]`).text().trim();
    const forks = parseInt(forksText.replace(/[^0-9]/g, '')) || 0;

    // 今日新增 Fork
    const todayForkText = $el.find('.d-inline-block.float-sm-right').text().trim();
    const todayForks = parseInt(todayForkText.replace(/[^0-9]/g, '')) || 0;

    // Built by (贡献者头像)
    const builders = [];
    $el.find('.avatar').each((_, av) => {
      const avatarUrl = $(av).attr('src');
      const profileLink = $(av).closest('a').attr('href');
      if (profileLink) builders.push({ user: profileLink.replace('/', ''), avatar: avatarUrl });
    });

    repos.push({
      owner,
      name,
      fullName: `${owner}/${name}`,
      description,
      language,
      totalStars,
      todayStars,
      forks,
      todayForks,
      builders,
      url: `https://github.com/${owner}/${name}`,
      scrapedAt: new Date().toISOString(),
      since,
    });
  });

  return repos;
}
