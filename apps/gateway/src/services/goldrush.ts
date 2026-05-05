const GOLDRUSH_BASE = 'https://api.covalenthq.com/v1';
const SOLANA_CHAIN = 'solana-mainnet';

export interface TokenBalance {
  symbol: string;
  name: string;
  /** Raw balance as a string (divide by 10^decimals for human amount). */
  balance: string;
  decimals: number;
  /** Current USD price per token. */
  usdRate: number;
  /** USD value of the full balance. */
  usdValue: number;
  logoUrl: string | null;
}

interface RawItem {
  contract_ticker_symbol: string;
  contract_name: string;
  balance: string;
  contract_decimals: number;
  quote_rate: number | null;
  quote: number | null;
  is_spam: boolean;
  logo_urls?: { token_logo_url?: string };
}

/**
 * Fetch SPL token balances for a Solana wallet address via GoldRush.
 * Filters spam tokens and returns non-zero balances with USD pricing.
 */
export async function fetchSolanaBalances(
  address: string,
  apiKey: string,
): Promise<TokenBalance[]> {
  const url = `${GOLDRUSH_BASE}/${SOLANA_CHAIN}/address/${encodeURIComponent(address)}/balances_v2/?quote-currency=USD&no-spam=true`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`GoldRush error ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  const items: RawItem[] = json?.data?.items ?? [];

  return items
    .filter(item => !item.is_spam && item.balance && item.balance !== '0')
    .map(item => ({
      symbol: item.contract_ticker_symbol ?? '???',
      name: item.contract_name ?? '',
      balance: item.balance,
      decimals: item.contract_decimals ?? 0,
      usdRate: item.quote_rate ?? 0,
      usdValue: item.quote ?? 0,
      logoUrl: item.logo_urls?.token_logo_url ?? null,
    }));
}

/** Simple in-process cache so repeated dashboard refreshes don't hammer the API. */
const balanceCache = new Map<string, { data: TokenBalance[]; ts: number }>();
const CACHE_TTL_MS = 30_000;

export async function fetchSolanaBalancesCached(
  address: string,
  apiKey: string,
): Promise<TokenBalance[]> {
  const cached = balanceCache.get(address);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const data = await fetchSolanaBalances(address, apiKey);
  balanceCache.set(address, { data, ts: Date.now() });
  return data;
}
