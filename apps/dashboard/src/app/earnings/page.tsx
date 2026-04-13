import { getDeposits, getDepositCount } from '@/lib/api';
import type { Deposit } from '@/lib/api';
import { StatsCard } from '@/components/stats-card';

function formatAmount(amount: number, token: string) {
  return `${(amount / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${token}`;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncate(str: string, len = 12) {
  if (str.length <= len) return str;
  return str.slice(0, 6) + '…' + str.slice(-6);
}

function getThisMonthDeposits(deposits: Deposit[]) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return deposits.filter((d) => d.timestamp * 1000 >= startOfMonth);
}

export default async function EarningsPage() {
  let deposits: Deposit[] = [];
  let totalCount = 0;
  let error: string | null = null;

  try {
    const [depositsRes, countRes] = await Promise.all([
      getDeposits(),
      getDepositCount(),
    ]);
    deposits = depositsRes.deposits ?? [];
    totalCount = countRes.count ?? 0;
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load data';
  }

  const totalEarned = deposits.reduce((sum, d) => sum + (d.amount ?? 0), 0);
  const thisMonthDeposits = getThisMonthDeposits(deposits);
  const thisMonthTotal = thisMonthDeposits.reduce((sum, d) => sum + (d.amount ?? 0), 0);
  const avgPerDeposit = deposits.length > 0 ? totalEarned / deposits.length : 0;
  const recent = deposits.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);

  // Default token for display
  const defaultToken = deposits[0]?.token ?? 'USDC';

  return (
    <div className="px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-100">Earnings Overview</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Confirmed deposits into the SKAUS stealth pool
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Stats grid */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="Total Earned (All Time)"
          value={formatAmount(totalEarned, defaultToken)}
          subtext={`${totalCount} total deposits`}
          accent
        />
        <StatsCard
          label="This Month"
          value={formatAmount(thisMonthTotal, defaultToken)}
          subtext={`${thisMonthDeposits.length} deposits`}
        />
        <StatsCard
          label="Avg per Deposit"
          value={formatAmount(avgPerDeposit, defaultToken)}
          subtext="all time"
        />
        <StatsCard
          label="Pending Withdrawals"
          value="—"
          subtext="submit proof to withdraw"
        />
      </div>

      {/* Recent deposits */}
      <div className="card">
        <h2 className="mb-4 text-base font-semibold text-neutral-200">Recent Deposits</h2>

        {deposits.length === 0 && !error ? (
          <p className="py-8 text-center text-sm text-neutral-600">No deposits yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="pb-3 text-left table-header">Date</th>
                  <th className="pb-3 text-left table-header">Amount</th>
                  <th className="pb-3 text-left table-header">Pool</th>
                  <th className="pb-3 text-left table-header">Commitment</th>
                  <th className="pb-3 text-left table-header">Tx</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {recent.map((deposit) => (
                  <tr key={deposit.txSignature} className="hover:bg-neutral-800/30 transition-colors">
                    <td className="table-cell pr-4 whitespace-nowrap text-neutral-400">
                      {formatDate(deposit.timestamp * 1000)}
                    </td>
                    <td className="table-cell pr-4 font-mono font-medium text-emerald-400">
                      {formatAmount(deposit.amount, deposit.token)}
                    </td>
                    <td className="table-cell pr-4">
                      <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-400">
                        {deposit.pool ? truncate(deposit.pool, 16) : '—'}
                      </span>
                    </td>
                    <td className="table-cell pr-4 font-mono text-xs text-neutral-500">
                      {deposit.commitment ? truncate(deposit.commitment, 20) : '—'}
                    </td>
                    <td className="table-cell">
                      {deposit.txSignature ? (
                        <a
                          href={`https://solscan.io/tx/${deposit.txSignature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-brand-400 hover:text-brand-300 hover:underline transition-colors"
                        >
                          {truncate(deposit.txSignature)}
                        </a>
                      ) : (
                        <span className="text-neutral-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
