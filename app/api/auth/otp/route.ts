import { errorResponse } from '@/lib/utils/apiResponse';

export async function POST() {
  return errorResponse('ENDPOINT_RETIRED', 'This endpoint has been retired. Use /api/auth/send-otp.', 410);
}
