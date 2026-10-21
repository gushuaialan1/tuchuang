import { getRequestContext } from '@cloudflare/next-on-pages';
import { ensureD1Indexes } from '@/lib/d1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400', // 24 hours
  'Content-Type': 'application/json'
};

export const runtime = 'edge';

export async function POST(request) {
  const { env } = getRequestContext();
  try {
    await ensureD1Indexes(env.IMG);
    let { page, query } = await request.json();
    const offset = (Number(page) || 0) * 10;

    if (query) {
      const likeQuery = `%${query}%`;
      const ps = env.IMG.prepare('SELECT * FROM imginfo WHERE url LIKE ? ORDER BY id DESC LIMIT 10 OFFSET ?')
        .bind(likeQuery, offset);
      const { results } = await ps.all();
      const total = await env.IMG.prepare('SELECT COUNT(*) as total FROM imginfo WHERE url LIKE ?')
        .bind(likeQuery)
        .first();
      return Response.json({
        "code": 200,
        "success": true,
        "message": "success",
        "data": results,
        "page": page,
        "total": total.total
      });
    } else {
      const ps = env.IMG.prepare('SELECT * FROM imginfo ORDER BY id DESC LIMIT 10 OFFSET ?')
        .bind(offset);
      const { results } = await ps.all();
      const total = await env.IMG.prepare('SELECT COUNT(*) as total FROM imginfo').first();
      return Response.json({
        "code": 200,
        "success": true,
        "message": "success",
        "data": results,
        "page": page,
        "total": total.total
      });
    }
  } catch (error) {
    return Response.json({
      "code": 500,
      "success": false,
      "message": error.message,
      "data": null,
    }, {
      status: 500,
      headers: corsHeaders,
    });
  }
}
