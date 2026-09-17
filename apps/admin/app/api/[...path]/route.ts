import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || 'https://www.junkitout.in';

type Props = {
  params: Promise<{ path: string[] }> | { path: string[] };
};

async function handleProxy(req: NextRequest, props: Props) {
  const resolvedParams = await props.params;
  const pathSegments = resolvedParams.path || [];
  const subPath = pathSegments.join('/');
  const search = req.nextUrl.search || '';

  const baseUrl = BACKEND_URL.endsWith('/') ? BACKEND_URL.slice(0, -1) : BACKEND_URL;
  const targetUrl = `${baseUrl}/api/${subPath}${search}`;

  const cookieStore = await cookies();
  const token = cookieStore.get('jio_token')?.value;

  const incomingHeaders = new Headers(req.headers);
  const headers = new Headers();

  const contentType = incomingHeaders.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  const accept = incomingHeaders.get('accept');
  if (accept) headers.set('accept', accept);

  const rawCookie = incomingHeaders.get('cookie') || '';
  if (token && !rawCookie.includes('jio_token=')) {
    headers.set('cookie', `jio_token=${token}${rawCookie ? `; ${rawCookie}` : ''}`);
  } else if (rawCookie) {
    headers.set('cookie', rawCookie);
  } else if (token) {
    headers.set('cookie', `jio_token=${token}`);
  }

  const rawAuth = incomingHeaders.get('authorization');
  if (rawAuth) {
    headers.set('authorization', rawAuth);
  } else if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  let body: ArrayBuffer | undefined = undefined;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    try {
      const arrayBuffer = await req.arrayBuffer();
      if (arrayBuffer.byteLength > 0) {
        body = arrayBuffer;
      }
    } catch {
      // Body reading omitted if empty
    }
  }

  try {
    const backendRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      cache: 'no-store',
    });

    const resHeaders = new Headers();
    backendRes.headers.forEach((val, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'set-cookie') {
        resHeaders.append('set-cookie', val);
      } else if (!['transfer-encoding', 'content-encoding', 'content-length'].includes(lowerKey)) {
        resHeaders.set(key, val);
      }
    });

    const responseData = await backendRes.arrayBuffer();
    return new NextResponse(responseData, {
      status: backendRes.status,
      statusText: backendRes.statusText,
      headers: resHeaders,
    });
  } catch (err: any) {
    console.error('API Proxy Error:', err);
    return NextResponse.json(
      { success: false, error: { message: err.message || 'Proxy request failed' } },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, props: Props) {
  return handleProxy(req, props);
}

export async function POST(req: NextRequest, props: Props) {
  return handleProxy(req, props);
}

export async function PUT(req: NextRequest, props: Props) {
  return handleProxy(req, props);
}

export async function PATCH(req: NextRequest, props: Props) {
  return handleProxy(req, props);
}

export async function DELETE(req: NextRequest, props: Props) {
  return handleProxy(req, props);
}

export async function HEAD(req: NextRequest, props: Props) {
  return handleProxy(req, props);
}

export async function OPTIONS(req: NextRequest, props: Props) {
  return handleProxy(req, props);
}
