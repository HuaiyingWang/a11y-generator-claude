/**
 * 後台內容無障礙助手 — Cloudflare Worker
 * =========================================
 * 功能：轉發請求給 Anthropic API，處理 CORS
 *
 * 部署前請在 Cloudflare Worker 的「Settings → Variables」加入：
 *   ANTHROPIC_API_KEY = sk-ant-xxxxxxxxxxxxxxxx  （Secret，勾選加密）
 *
 * 如果你的 GitHub Pages 網址不是 xxx.github.io 結尾，
 * 請修改下方 ALLOWED_ORIGINS 加入你的正式網域。
 */

const ALLOWED_ORIGINS = [
  /^https:\/\/[^.]+\.github\.io$/,     /* GitHub Pages：xxx.github.io */
  /^http:\/\/localhost(:\d+)?$/,        /* 本機開發測試 */
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,    /* 本機開發測試 */
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.some(re => re.test(origin || ''));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(origin) });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    if (!body.model || !body.messages || !Array.isArray(body.messages)) {
      return new Response(JSON.stringify({ error: 'Missing required fields: model, messages' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    if (!env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'Server misconfigured: missing API key' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    let anthropicRes;
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: body.model,
          max_tokens: body.max_tokens || 4096,
          system: body.system || '',
          messages: body.messages,
        }),
      });
    } catch {
      return new Response(JSON.stringify({ error: '無法連線至 AI 服務，請稍後再試' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      });
    }

    const responseText = await anthropicRes.text();
    return new Response(responseText, {
      status: anthropicRes.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
  },
};
