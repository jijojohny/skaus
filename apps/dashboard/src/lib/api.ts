const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface Deposit {
  commitment: string;
  pool: string;
  amount: number;
  token: string;
  slot: number;
  timestamp: number;
  txSignature: string;
}

export interface DepositsResponse {
  count: number;
  deposits: Deposit[];
}

export interface DepositCountResponse {
  count: number;
}

export interface WithdrawPublicInputs {
  merkleRoot: string;
  nullifierHash: string;
  recipient: string;
  amount: string;
  fee: string;
}

export interface WithdrawBody {
  proof: string;
  tokenMint: string;
  publicInputs: WithdrawPublicInputs;
}

export interface WithdrawResult {
  txSignature: string;
  status: string;
}

export interface RelayStatus {
  relayerPublicKey: string;
  solBalance: number;
  ready: boolean;
}

export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'expired' | 'cancelled';

export interface PaymentRecord {
  txSignature: string;
  amount: number;
  paidAt: number;
}

export interface PaymentRequest {
  id: string;
  creator: string;
  username: string;
  slug: string;
  amount: number;
  token: string;
  memo: string;
  title: string;
  openAmount: boolean;
  expiresAt: number | null;
  maxPayments: number;
  depositPathIndex: number;
  status: PaymentStatus;
  payments: PaymentRecord[];
  createdAt: number;
  updatedAt: number;
  views: number;
  payUrl?: string;
}

export interface CreateRequestBody {
  creator: string;
  username: string;
  amount: number;
  token?: string;
  memo?: string;
  title?: string;
  openAmount?: boolean;
  expiresAt?: number;
  maxPayments?: number;
  depositPathIndex: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    // Next.js 14 server component cache: no-store to always get fresh data
    cache: init?.cache ?? 'no-store',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gateway ${path} returned ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Indexer
// ---------------------------------------------------------------------------

export async function getDeposits(opts?: { pool?: string; since?: number }): Promise<DepositsResponse> {
  const params = new URLSearchParams();
  if (opts?.pool) params.set('pool', opts.pool);
  if (opts?.since !== undefined) params.set('since', String(opts.since));
  const qs = params.toString() ? `?${params}` : '';
  return apiFetch<DepositsResponse>(`/indexer/deposits${qs}`);
}

export async function getDepositCount(): Promise<DepositCountResponse> {
  return apiFetch<DepositCountResponse>('/indexer/deposits/count');
}

// ---------------------------------------------------------------------------
// Relay
// ---------------------------------------------------------------------------

export async function submitWithdrawal(body: WithdrawBody): Promise<WithdrawResult> {
  return apiFetch<WithdrawResult>('/relay/withdraw', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getRelayStatus(): Promise<RelayStatus> {
  return apiFetch<RelayStatus>('/relay/status');
}

// ---------------------------------------------------------------------------
// Payment requests
// ---------------------------------------------------------------------------

export async function createPaymentRequest(body: CreateRequestBody): Promise<PaymentRequest> {
  return apiFetch<PaymentRequest>('/requests', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getPaymentRequest(id: string): Promise<PaymentRequest> {
  return apiFetch<PaymentRequest>(`/requests/${id}`);
}

export async function getPaymentRequestsByCreator(
  creator: string,
  status?: string,
): Promise<{ requests: PaymentRequest[] }> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const qs = params.toString() ? `?${params}` : '';
  return apiFetch<{ requests: PaymentRequest[] }>(`/requests/by-creator/${encodeURIComponent(creator)}${qs}`);
}

export async function cancelPaymentRequest(id: string, creator: string): Promise<PaymentRequest> {
  return apiFetch<PaymentRequest>(`/requests/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ creator }),
  });
}
