/**
 * AI Analysis Module — LM Studio 集成
 * 通过 OpenAI 兼容 API 调用本地 LLM
 */

let lmToken = process.env.LMSTUDIO_TOKEN || process.env.LMSTUDIO_API_KEY || process.env.LM_TOKEN || '';
let lmBase = process.env.LMSTUDIO_URL || 'http://localhost:1234';
let lmModel = process.env.LM_MODEL || 'qwen2.5-coder-7b-instruct';

export function reloadConfig(token, url, model) {
  if (token !== undefined) lmToken = token;
  if (url !== undefined) lmBase = url;
  if (model !== undefined) lmModel = model;
  console.log('[AI] Config updated: url=' + lmBase + ', model=' + lmModel + ', token=' + (lmToken ? 'set' : 'unset'));
}

async function chat(messages, options) {
  options = options || {};
  var body = {
    model: lmModel,
    messages: messages,
    temperature: options.temperature != null ? options.temperature : 0.3,
    max_tokens: options.maxTokens || 200,
    stream: false,
  };

  var headers = { 'Content-Type': 'application/json' };
  if (lmToken) headers['Authorization'] = 'Bearer ' + lmToken;

  var res = await fetch(lmBase + '/v1/chat/completions', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeout || 60000),
  });

  if (!res.ok) {
    var errText = await res.text().catch(function() { return ''; });
    if (res.status === 401) {
      throw new Error('LM Studio needs API Token. Set LMSTUDIO_TOKEN or LMSTUDIO_API_KEY');
    }
    throw new Error('LM Studio API error (' + res.status + '): ' + errText.slice(0, 200));
  }

  var data = await res.json();
  var msg = data.choices && data.choices[0] && data.choices[0].message;
  var text = (msg && (msg.content || msg.reasoning_content)) || '';
  return text.replace(/\*{1,2}/g, '').trim().slice(0, 500);
}

export async function summarizeRepo(repo) {
  return chat([
    { role: 'system', content: '你是一个 GitHub 分析师。用一句话（50字内）说明这个仓库的核心价值和受欢迎原因。' },
    { role: 'user', content: '仓库：' + repo.fullName + '\n描述：' + (repo.description || '无') + '\n语言：' + (repo.language || 'N/A') + '\n星标：' + (repo.totalStars || repo.stars || 0) },
  ], { maxTokens: 200 });
}

export async function analyzeTrends(repos) {
  var top10 = repos.slice(0, 10).map(function(r, i) {
    return (i + 1) + '. ' + r.fullName + ' (星' + (r.totalStars || r.stars || 0) + ', +' + (r.todayStars || 0) + ', ' + (r.language || '?') + ')';
  }).join('\n');

  return chat([
    { role: 'system', content: '你是一个技术趋势分析师。列出：1) 热门语言 2) 领域方向 3) 值得关注的项目。80字内。' },
    { role: 'user', content: 'GitHub Trending Top 10:\n' + top10 + '\n\n分析本期趋势。' },
  ], { maxTokens: 300 });
}

export async function summarizeTopic(topic, repos) {
  var repoList = repos.slice(0, 8).map(function(r, i) {
    return (i + 1) + '. ' + r.fullName + ' (星' + (r.stars || 0) + ', ' + (r.language || '?') + ')';
  }).join('\n');

  return chat([
    { role: 'system', content: '你是一个开源生态分析师。一句话总结该话题的开源生态：整体质量、主流语言、应用方向。60字内。' },
    { role: 'user', content: '话题：' + topic + '\n热门仓库：\n' + repoList + '\n\n总结该话题。' },
  ], { maxTokens: 200 });
}

export async function checkHealth() {
  try {
    var headers = {};
    if (lmToken) headers['Authorization'] = 'Bearer ' + lmToken;
    var res = await fetch(lmBase + '/v1/models', {
      headers: headers,
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    var data = await res.json();
    return !!(data && data.data && data.data.length);
  } catch (e) {
    return false;
  }
}
