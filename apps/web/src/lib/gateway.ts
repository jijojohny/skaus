import { config } from './config';

export interface PayLinkData {
  version: number;
  username: string;
  recipientMetaAddress: {
    scanPubkey: string;
    spendPubkey: string;
    version: number;
  };
  pool: string;
  network: string;
  amount: string | null;
  token: string;
  profileCid?: string | null;
  depositIndex?: number;
}

export interface IndexedDeposit {
  pool: string;
  commitment: string;
  leafIndex: number;
  amount: string;
  encryptedNote: string;
  timestamp: number;
  txSignature: string;
  slot: number;
}

export async function resolvePayLink(username: string): Promise<PayLinkData> {
  const res = await fetch(`${config.gatewayUrl}/pay/${username}`);
  if (!res.ok) {
    if (res.status === 404) throw new Error(`User @${username} not found`);
    throw new Error(`Failed to resolve pay link: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchDeposits(pool?: string, since?: number): Promise<IndexedDeposit[]> {
  const params = new URLSearchParams();
  if (pool) params.set('pool', pool);
  if (since) params.set('since', since.toString());
  const res = await fetch(`${config.gatewayUrl}/indexer/deposits?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch deposits: ${res.statusText}`);
  const data = await res.json();
  return data.deposits;
}

export async function submitWithdrawal(body: {
  proof: string;
  tokenMint: string;
  publicInputs: {
    merkleRoot: string;
    nullifierHash: string;
    recipient: string;
    amount: string;
    fee: string;
  };
}): Promise<{ txSignature: string; status: string; fee: string }> {
  const res = await fetch(`${config.gatewayUrl}/relay/withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Withdrawal relay failed');
  }
  return res.json();
}

export async function getRelayStatus(): Promise<{
  active: boolean;
  pendingTxs: number;
  totalRelayed: number;
  relayerPubkey: string | null;
}> {
  const res = await fetch(`${config.gatewayUrl}/relay/status`);
  if (!res.ok) throw new Error('Failed to get relay status');
  return res.json();
}

export async function checkHealth(): Promise<{
  status: string;
  cluster: string;
  slot: number;
}> {
  const res = await fetch(`${config.gatewayUrl}/health`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Name Registry
// ---------------------------------------------------------------------------

export interface NameLookupResult {
  username: string;
  authority: string;
  nameHash: string;
  stealthMetaAddress: {
    scanPubkey: string;
    spendPubkey: string;
    version: number;
  };
  profileCid: string | null;
  depositIndex: number;
  status: string;
  available: boolean;
}

export async function lookupName(username: string): Promise<NameLookupResult> {
  const res = await fetch(`${config.gatewayUrl}/names/${username}`);
  if (!res.ok) {
    if (res.status === 404) {
      return { username, available: true } as NameLookupResult;
    }
    throw new Error(`Name lookup failed: ${res.statusText}`);
  }
  return res.json();
}

export async function checkNameAvailability(username: string): Promise<{ available: boolean }> {
  const res = await fetch(`${config.gatewayUrl}/names/${username}/available`);
  if (!res.ok) throw new Error('Availability check failed');
  return res.json();
}

export async function lookupByAuthority(address: string): Promise<{
  registered: boolean;
  names: Array<{ pda: string; nameHash: string; scanPubkey: string; spendPubkey: string; username: string | null }>;
}> {
  const res = await fetch(`${config.gatewayUrl}/names/by-authority/${address}`);
  if (!res.ok) return { registered: false, names: [] };
  return res.json();
}

// ---------------------------------------------------------------------------
// Payment Requests
// ---------------------------------------------------------------------------

export interface PaymentRequestData {
  id: string;
  creator: string;
  username?: string;
  slug: string;
  amount: number;
  token: string;
  memo: string;
  title?: string;
  openAmount?: boolean;
  expiresAt: number | null;
  maxPayments: number;
  depositPathIndex: number;
  status: string;
  payments: Array<{ txSignature: string; amount: number; paidAt: number }>;
  createdAt: number;
  updatedAt: number;
  payUrl?: string;
  views?: number;
}

export async function createPaymentRequest(body: {
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
}): Promise<PaymentRequestData> {
  const res = await fetch(`${config.gatewayUrl}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to create payment request');
  return res.json();
}

export async function getPaymentRequest(
  id: string,
  options?: { recordView?: boolean },
): Promise<PaymentRequestData> {
  const q = options?.recordView ? '?recordView=1' : '';
  const res = await fetch(`${config.gatewayUrl}/requests/${id}${q}`);
  if (!res.ok) throw new Error('Payment request not found');
  return res.json();
}

export async function getPaymentRequestBySlug(
  username: string,
  slug: string,
  options?: { recordView?: boolean },
): Promise<PaymentRequestData> {
  const q = options?.recordView ? '?recordView=1' : '';
  const res = await fetch(
    `${config.gatewayUrl}/requests/by-slug/${encodeURIComponent(username)}/${encodeURIComponent(slug)}${q}`,
  );
  if (!res.ok) throw new Error('Payment request not found');
  return res.json();
}

export async function listPaymentRequests(creator: string, status?: string): Promise<PaymentRequestData[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const res = await fetch(`${config.gatewayUrl}/requests/by-creator/${creator}?${params}`);
  if (!res.ok) throw new Error('Failed to list payment requests');
  const data = await res.json();
  return data.requests;
}

export async function cancelPaymentRequest(id: string, creator: string): Promise<PaymentRequestData> {
  const res = await fetch(`${config.gatewayUrl}/requests/${id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creator }),
  });
  if (!res.ok) throw new Error('Failed to cancel request');
  return res.json();
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

import type { CompressedProfile } from '@skaus/types';

export async function fetchProfile(username: string): Promise<CompressedProfile | null> {
  const res = await fetch(`${config.gatewayUrl}/profiles/${username}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
}

export interface UpdateProfileResult {
  compressedHash: string;
  compressedOnChain: boolean;
  compressionTxSig: string | null;
}

export async function updateProfile(
  username: string,
  profile: CompressedProfile,
  authority: string,
): Promise<UpdateProfileResult> {
  const res = await fetch(`${config.gatewayUrl}/profiles/${username}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...profile, authority }),
  });
  if (!res.ok) throw new Error('Failed to update profile');
  const data = await res.json();
  return {
    compressedHash: data.compressedHash,
    compressedOnChain: data.compressedOnChain,
    compressionTxSig: data.compressionTxSig ?? null,
  };
}

export async function linkProfileToChain(
  username: string,
  authority: string,
): Promise<{ transaction: string; hash: string }> {
  const res = await fetch(`${config.gatewayUrl}/profiles/${username}/link-to-chain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authority }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Failed to build link-to-chain transaction');
  }
  return res.json();
}

export async function confirmProfileOnChain(
  username: string,
  hash: string,
  txSignature: string,
): Promise<void> {
  const res = await fetch(`${config.gatewayUrl}/profiles/${username}/confirm-on-chain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash, txSignature }),
  });
  if (!res.ok) throw new Error('Failed to confirm profile on-chain');
}

export async function searchProfiles(query: string, limit?: number): Promise<CompressedProfile[]> {
  const params = new URLSearchParams({ q: query });
  if (limit) params.set('limit', limit.toString());
  const res = await fetch(`${config.gatewayUrl}/profiles?${params}`);
  if (!res.ok) throw new Error('Search failed');
  const data = await res.json();
  return data.results;
}
