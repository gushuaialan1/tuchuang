import { handlers } from "@/auth";

export const runtime = 'edge';

const noStoreHeaders = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
};

export async function GET(req) {
  const res = await handlers.GET(req);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(noStoreHeaders)) {
    headers.set(k, v);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export async function POST(req) {
  let targetReq = req;
  const cookieHeader = req.headers.get('cookie') || '';

  // 当域名开启了 Cloudflare 全站缓存时，GET /api/auth/csrf 的 Set-Cookie 会被 CDN 剥离，
  // 导致 POST 登录/登出时因缺少 authjs.csrf-token Cookie 而报错 MissingCSRF。
  // 这里在服务端内部自动生成并补齐合法的 CSRF Cookie 与 csrfToken 参数。
  if (!cookieHeader.includes('authjs.csrf-token=')) {
    try {
      const csrfUrl = new URL('/api/auth/csrf', req.url);
      const csrfRes = await handlers.GET(new Request(csrfUrl, { headers: req.headers }));
      const setCookies = csrfRes.headers.getSetCookie
        ? csrfRes.headers.getSetCookie()
        : [csrfRes.headers.get('set-cookie')].filter(Boolean);
      const csrfCookiePart = setCookies
        .map((c) => c.split(';')[0])
        .find((c) => c.includes('authjs.csrf-token='));
      const csrfData = await csrfRes.json();

      if (csrfCookiePart && csrfData?.csrfToken) {
        const newHeaders = new Headers(req.headers);
        newHeaders.set('cookie', cookieHeader ? `${cookieHeader}; ${csrfCookiePart}` : csrfCookiePart);

        const contentType = req.headers.get('content-type') || '';
        if (contentType.includes('application/x-www-form-urlencoded')) {
          const bodyText = await req.text();
          const params = new URLSearchParams(bodyText);
          params.set('csrfToken', csrfData.csrfToken);
          targetReq = new Request(req.url, {
            method: req.method,
            headers: newHeaders,
            body: params.toString(),
          });
        } else if (contentType.includes('application/json')) {
          const bodyJson = await req.json();
          bodyJson.csrfToken = csrfData.csrfToken;
          targetReq = new Request(req.url, {
            method: req.method,
            headers: newHeaders,
            body: JSON.stringify(bodyJson),
          });
        }
      }
    } catch (e) {
      console.error('CSRF auto-fill error:', e);
    }
  }

  const res = await handlers.POST(targetReq);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(noStoreHeaders)) {
    headers.set(k, v);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
