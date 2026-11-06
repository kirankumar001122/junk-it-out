import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;

  if (!filename || !/^[a-zA-Z0-9_.-]+$/i.test(filename)) {
    return NextResponse.json({ success: false, message: 'Invalid photo filename.' }, { status: 400 });
  }

  const targetUrl = new URL(
    `/api/upload/view?url=${encodeURIComponent(`/uploads/${filename}`)}`,
    req.url
  );
  return NextResponse.redirect(targetUrl, { status: 307 });
}

