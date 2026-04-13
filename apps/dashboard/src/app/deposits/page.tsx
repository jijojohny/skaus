import { getDeposits } from '@/lib/api';
import type { Deposit } from '@/lib/api';

const PAGE_SIZE = 20;

function formatAmount(amount: number, token: string) {
  return `${(amount / 1_000_000).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })} ${token}`;
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

function truncate(str: string, maxLen = 16) {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, 8) + '…' + str.slice(-8);
}

interface PageProps {
  searchParams?: { page?: string; pool?: string };
}

export default async function DepositsPage({ searchParams }: PageProps) {
  const page = Math.max(1, Number(searchParams?.page ?? '1'));
  const pool = searchParams?.pool;

  let deposits: Deposit[] = [];
  let error: string | null = null;

  try {
    const res = await getDeposits(pool ? { pool } : undefined);
    deposits = res.deposits ?? [];
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load deposits';
  }

  const sorted = deposits.slice().sort((a, b) => b.timestamp - a.timestamp);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="px-8 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-100">Deposit History</h1>
          <p className="mt-1 text-sm text-neutral-500">
            All deposits indexed from the on-chain stealth pool
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <span className="rounded-full bg-neutral-800 px-3 py-1 font-medium text-neutral-300">
            {deposits.length} total
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="card">
        {paginated.length === 0 && !error ? (
          <p className="py-12 text-center text-sm text-neutral-600">No deposits found</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-800">
                    <th className="pb-3 text-left table-header pr-4">Date</th>
                    <th className="pb-3 text-right table-header pr-4">Amount</th>
                    <th className="pb-3 text-left table-header pr-4">Pool</th>
                    <th className="pb-3 text-left table-header pr-4">Commitment</th>
                    <th className="pb-3 text-left table-header">Tx Signature</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/50">
                  {paginated.map((deposit, i) => (
                    <tr
                      key={`${deposit.txSignature}-${i}`}
                      className="hover:bg-neutral-800/30 transition-colors"
                    >
                      <td className="table-cell pr-4 whitespace-nowrap text-neutral-400">
                        {formatDate(deposit.timestamp * 1000)}
                      </td>
                      <td className="table-cell pr-4 text-right font-mono font-semibold text-emerald-400">
                        {formatAmount(deposit.amount, deposit.token)}
                      </td>
                      <td className="table-cell pr-4">
                        {deposit.pool ? (
                          <span className="font-mono text-xs text-neutral-400">
                            {truncate(deposit.pool, 24)}
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>
                      <td className="table-cell pr-4">
                        {deposit.commitment ? (
                          <span
                            className="font-mono text-xs text-neutral-500"
                            title={deposit.commitment}
                          >
                            {truncate(deposit.commitment, 20)}
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>
                      <td className="table-cell">
                        {deposit.txSignature ? (
                          <a
                            href={`https://solscan.io/tx/${deposit.txSignature}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-brand-400 hover:text-brand-300 hover:underline transition-colors"
                            title={deposit.txSignature}
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-5 flex items-center justify-between border-t border-neutral-800 pt-4">
                <p className="text-xs text-neutral-500">
                  Page {currentPage} of {totalPages} · {deposits.length} records
                </p>
                <div className="flex items-center gap-2">
                  {currentPage > 1 && (
                    <a
                      href={`?page=${currentPage - 1}${pool ? `&pool=${pool}` : ''}`}
                      className="btn-ghost text-xs"
                    >
                      Previous
                    </a>
                  )}
                  {currentPage < totalPages && (
                    <a
                      href={`?page=${currentPage + 1}${pool ? `&pool=${pool}` : ''}`}
                      className="btn-ghost text-xs"
                    >
                      Next
                    </a>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
