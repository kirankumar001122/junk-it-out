import { NextResponse } from 'next/server';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: Record<string, any>;
}

export type ApiSuccessResponse<T = any> = {
  success: true;
  data: T;
  meta?: Record<string, any>;
};

export type ApiErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
};

export function successResponse<T>(data: T, status = 200, meta?: Record<string, any>) {
  const body: ApiSuccessResponse<T> = { success: true, data, ...(meta ? { meta } : {}) };
  return NextResponse.json(body, { status });
}

export function errorResponse(code: string, message: string, status = 400, details?: any) {
  const isInternal = status >= 500;
  const safeMessage = isInternal ? 'An unexpected error occurred. Please try again.' : message;
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message: safeMessage,
      ...(!isInternal && details !== undefined ? { details } : {}),
    },
  };
  return NextResponse.json(body, { status });
}
