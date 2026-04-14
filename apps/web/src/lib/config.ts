export const config = {
  gatewayUrl: process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3001',
  programId: process.env.NEXT_PUBLIC_PROGRAM_ID || 'EAeFbo2SKK7KGiUwj4WHAYQxVEWFgiU1ygao9rnB7cGq',
  nameRegistryProgramId: process.env.NEXT_PUBLIC_NAME_REGISTRY_PROGRAM_ID || 'JAmSyEVzHNCTzC6BETuRQdwK1gLQYUFnzwiVKRVYqpdT',
  tokenMint: process.env.NEXT_PUBLIC_TOKEN_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  cluster: (process.env.NEXT_PUBLIC_CLUSTER || 'devnet') as 'devnet' | 'mainnet-beta',
} as const;

/** Display hostname for the public link base, e.g. "skaus.me" or "localhost:3000". */
export function getPublicLinkHost(): string {
  const base = process.env.NEXT_PUBLIC_PUBLIC_LINK_BASE || 'https://skaus.me';
  try {
    return new URL(base).host;
  } catch {
    return 'skaus.me';
  }
}

/** Full URL payers can open (QR / copy). Override for local dev, e.g. http://localhost:3000 */
export function getPublicProfileUrl(username: string): string {
  const base = (process.env.NEXT_PUBLIC_PUBLIC_LINK_BASE || 'https://skaus.me').replace(/\/$/, '');
  return `${base}/${encodeURIComponent(username)}`;
}

export function getPaymentRequestUrl(username: string | undefined, slug: string): string {
  const u = username || 'pay';
  const base = (process.env.NEXT_PUBLIC_PUBLIC_LINK_BASE || 'https://skaus.me').replace(/\/$/, '');
  return `${base}/${encodeURIComponent(u)}/${encodeURIComponent(slug)}`;
}
