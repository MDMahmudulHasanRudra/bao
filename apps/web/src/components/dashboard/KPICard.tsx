'use client';

interface KPICardProps {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  source?: string;
  icon?: React.ReactNode;
  loading?: boolean;
  empty?: boolean;
  className?: string;
  onClick?: () => void;
}

const TREND_COLORS = {
  up: 'text-emerald-600 bg-emerald-50',
  down: 'text-rose-600 bg-rose-50',
  neutral: 'text-slate-500 bg-slate-100',
};

const TREND_ICONS = {
  up: (
    <svg aria-hidden className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M5.293 9.707a1 1 0 011.414 0L10 13.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  ),
  down: (
    <svg aria-hidden className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M14.707 10.293a1 1 0 01-1.414 0L10 6.414 6.707 9.707a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
        clipRule="evenodd"
      />
    </svg>
  ),
  neutral: (
    <svg aria-hidden className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 002 0v-4zm0 8a1 1 0 10-2 0 1 1 0 002 0z"
        clipRule="evenodd"
      />
    </svg>
  ),
};

export function KPICard({
  label,
  value,
  trend = 'neutral',
  trendValue,
  source,
  icon,
  loading = false,
  empty = false,
  className = '',
  onClick,
}: KPICardProps) {
  if (loading) {
    return (
      <div className={`rounded-xl border border-slate-200 bg-white p-4 animate-pulse ${className}`}>
        <div className="h-4 w-1/3 rounded bg-slate-200" />
        <div className="mt-2 h-8 w-1/2 rounded bg-slate-200" />
        <div className="mt-2 h-3 w-1/4 rounded bg-slate-200" />
      </div>
    );
  }

  const isEmpty = empty || (typeof value === 'number' && value === 0);

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-4 transition-all hover:shadow-md ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-500 truncate">{label}</p>
          <p className="mt-1 text-3xl font-semibold text-slate-900 tabular-nums">
            {isEmpty ? '—' : value}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {isEmpty && source
              ? `No data yet — ${source}`
              : source
                ? `Source: ${source} · just now`
                : '—'}
          </p>
        </div>
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 shrink-0">
            {icon}
          </div>
        )}
      </div>

      {(trend || trendValue) && (
        <div className="mt-3 flex items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TREND_COLORS[trend]}`}
          >
            {TREND_ICONS[trend]}
            {trendValue || (trend === 'up' ? '+12%' : trend === 'down' ? '-8%' : '—')}
          </span>
          <span className="text-[11px] text-slate-500">vs last period</span>
        </div>
      )}
    </div>
  );
}
