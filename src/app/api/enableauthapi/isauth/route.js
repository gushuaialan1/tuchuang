export const runtime = 'edge';
import { auth } from "@/auth";

async function handleIsAuth() {
  const enableAuthapi = process.env.ENABLE_AUTH_API === 'true';
  const session = await auth();
  const role = session?.user?.role;

  return new Response(
    JSON.stringify({
      status: "success",
      message: "You are logged in by user !",
      success: true,
      enableAuthapi: enableAuthapi,
      role: role
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
  return handleIsAuth(request);
}

export async function POST(request) {
  return handleIsAuth(request);
}
