export type CustomerPickupsResult =
  | { kind: 'orders'; orders: any[] }
  | { kind: 'unauthenticated' }
  | { kind: 'error'; message: string };

type JsonResponse = {
  status: number;
  json: () => Promise<unknown>;
};

export async function readCustomerPickupsResponse(
  response: JsonResponse,
): Promise<CustomerPickupsResult> {
  if (response.status === 401) {
    return { kind: 'unauthenticated' };
  }

  let body: any;
  try {
    body = await response.json();
  } catch {
    return {
      kind: 'error',
      message: 'The pickup service returned an unreadable response. Please retry.',
    };
  }

  if (body?.error?.code === 'UNAUTHORIZED') {
    return { kind: 'unauthenticated' };
  }

  if (!response.status || response.status < 200 || response.status >= 300) {
    return {
      kind: 'error',
      message:
        (typeof body?.error?.message === 'string' && body.error.message) ||
        (typeof body?.message === 'string' && body.message) ||
        'Failed to load your pickup history. Please retry.',
    };
  }

  if (body?.success === true && Array.isArray(body.data)) {
    return { kind: 'orders', orders: body.data };
  }

  return {
    kind: 'error',
    message:
      (typeof body?.error?.message === 'string' && body.error.message) ||
      'The pickup service returned an unexpected response. Please retry.',
  };
}
