import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { calculateWalletBonusQuote } from '@/lib/walletBonus';

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.customerId) {
    return NextResponse.json({ success: false, message: 'Authenticated customer access is required.' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 10 || amount > 100000) {
      return NextResponse.json({ success: false, message: 'Amount must be between ₹10 and ₹100,000.' }, { status: 400 });
    }
    return NextResponse.json({ success: true, data: await calculateWalletBonusQuote(amount) });
  } catch (error) {
    console.error('Wallet bonus quote failed:', error);
    return NextResponse.json({ success: false, message: 'Unable to calculate wallet bonus.' }, { status: 500 });
  }
}
