import { getRequestContext } from '@cloudflare/next-on-pages';
import { ensureD1Indexes } from '@/lib/d1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400', // 24 hours
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store, no-cache, must-revalidate',
};

export const runtime = 'edge';

async function handleTotal() {
  const { env } = getRequestContext();

  try {
    if (env.IMG) {
      await ensureD1Indexes(env.IMG);
      const total = await env.IMG.prepare('SELECT COUNT(*) as total FROM imginfo').first();
      return Response.json({
        "code": 200,
        "success": true,
        "message": "success",
        "total": total.total
      }, {
        headers: corsHeaders,
      });
    } else {
      return Response.json({
        "code": 500,
        "success": true,
        "message": "no db",
        "total": "?"
      }, {
        status: 500,
        headers: corsHeaders,
      });
    }
  } catch (error) {
    return Response.json({
      "code": 500,
      "success": false,
      "message": error.message,
      "total": "?"
    }, {
      status: 500,
      headers: corsHeaders,
    });
  }
}

export async function GET(request) {
  return handleTotal(request);
}

export async function POST(request) {
  return handleTotal(request);
}
