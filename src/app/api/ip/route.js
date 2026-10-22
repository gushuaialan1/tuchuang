export const runtime = 'edge';

async function handleIp(request) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || request.socket?.remoteAddress;
  const clientIp = ip ? ip.split(',')[0].trim() : 'IP not found';

  return new Response(
    JSON.stringify({
      ip: clientIp
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      },
    }
  );
}

export async function GET(request) {
  return handleIp(request);
}

export async function POST(request) {
  return handleIp(request);
}
