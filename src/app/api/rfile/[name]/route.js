export const runtime = 'edge';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { ensureD1Indexes } from '@/lib/d1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400', // 24 hours
  'Content-Type': 'application/json'
};

export async function OPTIONS(request) {
  return new Response(null, {
    headers: corsHeaders
  });
}


//https://developers.cloudflare.com/r2/examples/demo-worker/
export async function GET(request, { params }) {
  const { name } = params
  let { env, cf, ctx } = getRequestContext();

  if (!env.IMGRS) {
    return Response.json({
      status: 500,
      message: `IMGRS is not Set`,
      success: false
    }, {
      status: 500,
      headers: corsHeaders,
    })
  }

  const Referer = request.headers.get('Referer') || "Referer";
  const req_url = new URL(request.url);
  const isAdminReferer = (Referer === `${req_url.origin}/admin` || Referer === `${req_url.origin}/list` || Referer === `${req_url.origin}/`);

  // 构造缓存键
  const cacheKey = new Request(req_url.toString(), request);
  const cache = caches.default;

  // 1. 优先检查边缘缓存：命中缓存直接返回，不消耗 D1 读写配额
  let cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  // 2. 缓存未命中时查询鉴黄信息（走 idx_imginfo_url 索引）
  try {
    if (env.IMG) {
      await ensureD1Indexes(env.IMG);
      const rating = await getRating(env.IMG, `/rfile/${name}`);
      if (rating === 3 && !isAdminReferer) {
        return Response.redirect(`${req_url.origin}/img/blocked.png`, 302);
      }
    }
  } catch (error) {
    console.log(error);
  }

  try {
    const object = await env.IMGRS.get(name, {
      range: request.headers,
      onlyIf: request.headers,
    })

    if (object === null) {
      return Response.json({
        status: 404,
        message: `File not found`,
        success: false
      }, {
        status: 404,
        headers: corsHeaders,
      })
    }

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('Cache-Control', 'public, max-age=86400')

    if (object.range) {
      headers.set("content-range", `bytes ${object.range.offset}-${object.range.end ?? object.size - 1}/${object.size}`)
    }

    const status = object.body ? (request.headers.get("range") !== null ? 206 : 200) : 304

    let response_img = new Response(object.body, {
      headers,
      status
    })

    if (status === 200) {
      ctx.waitUntil(cache.put(cacheKey, response_img.clone()));
    }

    if (!isAdminReferer && env.IMG) {
      ctx.waitUntil(logRequest(env, name));
    }
    return response_img
  } catch (error) {
    return Response.json({
      status: 500,
      message: ` ${error.message}`,
      success: false
    }, {
      status: 500,
      headers: corsHeaders,
    })
  }
}


// 异步更新访问计数（仅在缓存未命中时更新，不再向 tgimglog 无限写入流水）
async function logRequest(env, name) {
  try {
    await env.IMG.prepare('UPDATE imginfo SET total = total + 1 WHERE url = ?')
      .bind(`/rfile/${name}`)
      .run();
  } catch (error) {
    console.error('Error logging request:', error);
  }
}


// 从数据库获取鉴黄信息（走 idx_imginfo_url 索引）
async function getRating(DB, url) {
  const ps = DB.prepare('SELECT rating FROM imginfo WHERE url = ?').bind(url);
  const result = await ps.first();
  return result ? result.rating : null;
}
