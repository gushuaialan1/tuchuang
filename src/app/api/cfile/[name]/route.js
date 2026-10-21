export const runtime = 'edge';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { ensureD1Indexes } from '@/lib/d1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400', // 24 hours
  'Content-Type': 'application/json'
};


function getContentType(fileName) {
  const extension = fileName.split('.').pop().toLowerCase();
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'pdf': 'application/pdf',
    'txt': 'text/plain',
    'html': 'text/html',
    'json': 'application/json',
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'mkv': 'video/x-matroska'
  };
  return mimeTypes[extension] || 'application/octet-stream';
}


export async function OPTIONS(request) {
  return new Response(null, {
    headers: corsHeaders
  });
}


export async function GET(request, { params }) {
  const { name } = params
  let { env, cf, ctx } = getRequestContext();

  let req_url = new URL(request.url);

  if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) {
    return Response.json({
      status: 500,
      message: `TG_BOT_TOKEN or TG_CHAT_ID is not Set`,
      success: false
    }, {
      status: 500,
      headers: corsHeaders,
    })
  }

  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || request.socket.remoteAddress;
  const clientIp = ip ? ip.split(',')[0].trim() : 'IP not found';
  const Referer = request.headers.get('Referer') || "Referer";
  const isAdminReferer = (Referer === `${req_url.origin}/admin` || Referer === `${req_url.origin}/list` || Referer === `${req_url.origin}/`);

  const cacheKey = new Request(req_url.toString(), request);
  const cache = caches.default;

  // 1. 优先检查边缘缓存：命中缓存直接返回，不消耗 D1 读取和写入配额
  let cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    return cachedResponse;
  }

  // 2. 缓存未命中时再查询 D1 鉴黄状态（使用索引查询，仅扫描 1 行）
  try {
    if (env.IMG) {
      await ensureD1Indexes(env.IMG);
      const rating = await getRating(env.IMG, `/cfile/${name}`);
      if (rating === 3 && !isAdminReferer) {
        return Response.redirect(`${req_url.origin}/img/blocked.png`, 302);
      }
    }
  } catch (error) {
    console.log(error);
  }

  try {
    const file_path = await getFile_path(env, name);
    const fileName = file_path.split('/').pop();

    if (file_path === "error") {
      return Response.json({
        status: 500,
        message: `File not found`,
        success: false
      }, {
        status: 500,
        headers: corsHeaders,
      })
    } else {
      const res = await fetch(`https://api.telegram.org/file/bot${env.TG_BOT_TOKEN}/${file_path}`, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      if (res.ok) {
        const fileBuffer = await res.arrayBuffer();

        const contentType = getContentType(fileName);
        const responseHeaders = {
          "Content-Disposition": `attachment; filename=${fileName}`,
          "Access-Control-Allow-Origin": "*",
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=86400"
        };
        const response_img = new Response(fileBuffer, {
          headers: responseHeaders
        });

        ctx.waitUntil(cache.put(cacheKey, response_img.clone()));

        if (!isAdminReferer && env.IMG) {
          ctx.waitUntil(logRequest(env, name));
        }
        return response_img;
      } else {
        return Response.json({
          status: 500,
          message: `Failed to fetch file from Telegram`,
          success: false
        }, {
          status: 500,
          headers: corsHeaders,
        })
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


async function getFile_path(env, file_id) {
  try {
    const url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/getFile?file_id=${file_id}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        "User-Agent": " Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome"
      },
    })

    let responseData = await res.json();

    if (responseData.ok) {
      const file_path = responseData.result.file_path
      return file_path
    } else {
      return "error";
    }
  } catch (error) {
    return "error";
  }
}


// 从数据库获取鉴黄信息（走 idx_imginfo_url 索引）
async function getRating(DB, url) {
  const ps = DB.prepare('SELECT rating FROM imginfo WHERE url = ?').bind(url);
  const result = await ps.first();
  return result ? result.rating : null;
}


// 异步更新访问计数（仅在缓存未命中时更新，不再向 tgimglog 无限写入流水）
async function logRequest(env, name) {
  try {
    await env.IMG.prepare('UPDATE imginfo SET total = total + 1 WHERE url = ?')
      .bind(`/cfile/${name}`)
      .run();
  } catch (error) {
    console.error('Error logging request:', error);
  }
}
