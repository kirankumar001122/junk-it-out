import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { handleSupportChat, checkSupportRateLimit, ChatMessage } from '@/lib/ai/supportAgent';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // 1. Rate Limiting Check
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';
    const rateCheck = checkSupportRateLimit(ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: 'Too many support requests. Please wait a few moments before trying again.',
          retryAfterSeconds: rateCheck.resetInSeconds,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateCheck.resetInSeconds),
          },
        }
      );
    }

    // 2. Parse & Validate Payload
    const body = await req.json().catch(() => ({}));
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!message) {
      return NextResponse.json(
        { success: false, message: 'Message is required.' },
        { status: 400 }
      );
    }

    if (message.length > 2000) {
      return NextResponse.json(
        { success: false, message: 'Message exceeds maximum length of 2000 characters.' },
        { status: 400 }
      );
    }

    const history: ChatMessage[] = Array.isArray(body.history)
      ? body.history
          .filter((m: any) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
          .slice(-6)
      : [];

    // 3. Extract Authenticated Customer Context
    const authUser = await getAuthUser(req);
    const context = {
      userId: authUser?.userId,
      customerId: authUser?.customerId,
      name: (authUser as any)?.user?.name,
      phone: (authUser as any)?.user?.phone || authUser?.phone,
      role: authUser?.role,
    };

    // 4. Generate AI Response
    const result = await handleSupportChat(message, history, context);

    return NextResponse.json({
      success: true,
      text: result.text,
      suggestedQuestions: result.suggestedQuestions,
      referenceId: result.referenceId,
      authenticated: Boolean(context.customerId),
    });
  } catch (error: any) {
    console.error('[SUPPORT_CHAT_ROUTE_ERROR]', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Support chat is currently experiencing a temporary issue. Please try again shortly.',
      },
      { status: 500 }
    );
  }
}
