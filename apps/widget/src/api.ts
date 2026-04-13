// ---------------------------------------------------------------------------
// Gateway API client — zero external dependencies
// ---------------------------------------------------------------------------

export interface PaymentRequestResponse {
  id: string;
  creator: string;
  username: string;
  slug: string;
  amount: number;
  token: string;
  title: string;
  openAmount: boolean;
  status: string;
  payUrl?: string;
}

export interface CreateRequestPayload {
  recipient: string;
  tokenMint: string;
  amount: number;
  // Widget creates requests on behalf of the recipient username
  creator?: string;
  username?: string;
  depositPathIndex?: number;
  memo?: string;
  title?: string;
}

/**
 * POST /requests — create a new payment request and return the response.
 * The gateway will assign an id and return a payUrl.
 */
export async function createPaymentRequest(
  gatewayUrl: string,
  payload: CreateRequestPayload,
): Promise<PaymentRequestResponse> {
  const body = {
    creator: payload.creator ?? payload.recipient,
    username: payload.recipient,
    amount: payload.amount,
    token: payload.tokenMint,
    memo: payload.memo ?? '',
    title: payload.title ?? `Pay ${payload.recipient}`,
    openAmount: payload.amount === 0,
    maxPayments: 1,
    depositPathIndex: payload.depositPathIndex ?? 0,
  };

  const res = await fetch(`${gatewayUrl}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gateway error ${res.status}: ${text}`);
  }

  return res.json() as Promise<PaymentRequestResponse>;
}

/**
 * GET /requests/:id — poll for payment status.
 */
export async function getPaymentStatus(
  gatewayUrl: string,
  requestId: string,
): Promise<PaymentRequestResponse> {
  const res = await fetch(`${gatewayUrl}/requests/${encodeURIComponent(requestId)}`);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gateway error ${res.status}: ${text}`);
  }

  return res.json() as Promise<PaymentRequestResponse>;
}
