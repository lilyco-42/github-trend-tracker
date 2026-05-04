/**
 * GitHub Trending Scraper
 * 抓取 github.com/trending 页面获取当日热门仓库
 */
import * as cheerio from 'cheerio';

const TRENDING_URL = 'https://github.com/trending';

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
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      throw new Error('Request to github.com/trending timed out (15s). Check your network.');
    }
    throw new Error(`Cannot reach github.com/trending — network issue (${err.cause?.code || err.message}). Check firewall/proxy settings.`);
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch trending: ${res.status}`);
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
