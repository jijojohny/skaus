interface StatsCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  delta?: {
    value: string;
    positive?: boolean;
  };
  accent?: boolean;
}

export function StatsCard({ label, value, subtext, delta, accent }: StatsCardProps) {
  return (
    <div
      className={[
        'card flex flex-col gap-2',
        accent ? 'border-brand-500/40 bg-brand-500/5' : '',
      ].join(' ')}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">{label}</p>

      <p
        className={[
          'text-2xl font-bold tabular-nums',
          accent ? 'text-brand-300' : 'text-neutral-100',
        ].join(' ')}
      >
        {value}
      </p>

      {(subtext || delta) && (
        <div className="flex items-center gap-2">
          {delta && (
            <span
              className={[
                'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold',
                delta.positive
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-red-500/15 text-red-400',
              ].join(' ')}
            >
              {delta.positive ? '+' : ''}{delta.value}
            </span>
          )}
          {subtext && (
            <span className="text-xs text-neutral-500">{subtext}</span>
          )}
        </div>
      )}
    </div>
  );
}
