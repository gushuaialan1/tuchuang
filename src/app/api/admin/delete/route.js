import { getRequestContext } from '@cloudflare/next-on-pages';
import { ensureD1Indexes } from '@/lib/d1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400', // 24 hours
  'Content-Type': 'application/json'
};

export const runtime = 'edge';

export async function DELETE(request) {
  let { name } = await request.json();
  const { env } = getRequestContext();
  const req_url = new URL(request.url);

  try {
    await ensureD1Indexes(env.IMG);
    const setData = await env.IMG.prepare('DELETE FROM imginfo WHERE url = ?')
      .bind(name)
      .run();
    await env.IMG.prepare('DELETE FROM tgimglog WHERE url = ?')
      .bind(name)
      .run()
      .catch(() => {});

    try {
      await caches.default.delete(`${req_url.origin}/api${name}`);
      await caches.default.delete(`${req_url.origin}${name}`);
    } catch (e) {}

    return Response.json({
      "code": 200,
      "success": true,
      "message": setData.success,
    });
  } catch (error) {
    return Response.json({
      "code": 500,
      "success": false,
      "message": error.message,
    }, {
      status: 500,
      headers: corsHeaders,
    });
  }
}
