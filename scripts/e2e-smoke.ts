/**
 * Minimal integration smoke: gateway reachable and /health responds.
 * Usage: GATEWAY_URL=http://localhost:3001 pnpm e2e:smoke
 */

const gatewayUrl = (process.env.GATEWAY_URL || 'http://localhost:3001').replace(/\/$/, '');

async function main() {
  const healthUrl = `${gatewayUrl}/health`;
  const res = await fetch(healthUrl, { signal: AbortSignal.timeout(15_000) });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error(`FAIL ${healthUrl} -> HTTP ${res.status}`, body);
    process.exit(1);
  }

  const status = (body as { status?: string }).status;
  if (status !== 'ok' && status !== 'degraded') {
    console.error(`FAIL unexpected health payload`, body);
    process.exit(1);
  }

  console.log(`OK ${healthUrl}`, body);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
