import { NextRequest, NextResponse } from 'next/server';
import { processExpiredWalletBonuses } from '@/lib/walletBonusLifecycle';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = req.headers.get('authorization');
  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ success: false, message: 'Unauthorized.' }, { status: 401 });
  }
  try {
    return NextResponse.json({ success: true, data: await processExpiredWalletBonuses() });
  } catch (error) {
    console.error('Wallet bonus expiry job failed:', error);
    return NextResponse.json({ success: false, message: 'Expiry job failed.' }, { status: 500 });
  }
}
