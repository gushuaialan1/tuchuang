export const runtime = 'edge';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { ensureD1Indexes } from '@/lib/d1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400', // 24 hours
  'Content-Type': 'application/json'
};

export async function GET(request, { params }) {
  const { name } = params
  let { env, cf, ctx } = getRequestContext();

  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || request.socket.remoteAddress;
  const clientIp = ip ? ip.split(',')[0].trim() : 'IP not found';
  const Referer = request.headers.get('Referer') || "Referer";

  const req_url = new URL(request.url);
  const isAdminReferer = (Referer == req_url.origin + "/admin" || Referer == req_url.origin + "/list" || Referer == req_url.origin + "/");

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400', // 24小时
      },
    });
  }

  const cacheKey = new Request(req_url.toString(), request);
  const cache = caches.default;
  let cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const res = await fetch(`https://telegra.ph/file/${name}`, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    })
    if (isAdminReferer || !env.IMG) {
      return res
    } else {
      await ensureD1Indexes(env.IMG);
      const rating = await getRating(env.IMG, `/file/${name}`);
      if (rating) {
        ctx.waitUntil(
          env.IMG.prepare('UPDATE imginfo SET total = total + 1 WHERE url = ?')
            .bind(`/file/${name}`)
            .run()
            .catch((err) => console.log(err))
        );
        if (rating.rating == 3) {
          return Response.redirect(`${req_url.origin}/img/blocked.png`, 302);
        } else {
          return res;
        }
      } else {
        if (env.PROXYALLIMG) {
          try {
            const rating_index = await getModerateContentRating(env, `/file/${name}`)
            const nowTime = await get_nowTime()
            await insertImgInfo(env.IMG, `/file/${name}`, Referer, clientIp, rating_index, nowTime);

            if (rating_index == 3) {
              return Response.redirect(`${req_url.origin}/img/blocked.png`, 302);
            } else {
              return res;
            }
          } catch (error) {
            return res;
          }
        } else {
          return Response.redirect(`https://telegra.ph/file/${name}`, 302);
        }
      }
    }
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

// 插入 imginfo 记录
async function insertImgInfo(DB, url, referer, ip, rating, time) {
  try {
    await DB.prepare(
      'INSERT INTO imginfo (url, referer, ip, rating, total, time) VALUES (?, ?, ?, ?, 1, ?)'
    ).bind(url, referer, ip, rating, time).run();
  } catch (error) {
  }
}

// 从数据库获取鉴黄信息（走 idx_imginfo_url 索引）
async function getRating(DB, url) {
  const ps = DB.prepare('SELECT rating FROM imginfo WHERE url = ?').bind(url);
  const result = await ps.first();
  return result;
}

// 调用 ModerateContent API 鉴黄
async function getModerateContentRating(env, url) {
  try {
    const apikey = env.ModerateContentApiKey 
    const ModerateContentUrl = apikey ? `https://api.moderatecontent.com/moderate/?key=${apikey}&` : ""
    const ratingApi = env.RATINGAPI ? `${env.RATINGAPI}?` : ModerateContentUrl;
    if (ratingApi) {
      const res = await fetch(`${ratingApi}url=https://telegra.ph${url}`);
      const data = await res.json();
      const rating_index = data.hasOwnProperty('rating_index') ? data.rating_index : -1;
      return rating_index;
    } else {
      return 0
    }
  } catch (error) {
    return -1
  }
}

async function get_nowTime() {
  const options = {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  };
  const timedata = new Date();
  const formattedDate = new Intl.DateTimeFormat('zh-CN', options).format(timedata);
  return formattedDate
}
