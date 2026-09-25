'use client';

interface LiveIndicatorProps {
  isLive?: boolean;
  lastUpdated?: Date;
  className?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  autoRefresh?: boolean;
  onAutoRefreshToggle?: (enabled: boolean) => void;
}

export function LiveIndicator({
  isLive = true,
  lastUpdated,
  className = '',
  onRefresh,
  refreshing = false,
  autoRefresh = false,
  onAutoRefreshToggle,
}: LiveIndicatorProps) {
  const timeAgo = lastUpdated ? Math.floor((Date.now() - lastUpdated.getTime()) / 1000) : 0;

  const getTimeAgoString = () => {
    if (timeAgo < 30) return 'just now';
    if (timeAgo < 60) return `${timeAgo}s ago`;
    if (timeAgo < 3600) return `${Math.floor(timeAgo / 60)}m ago`;
    return lastUpdated!.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
          isLive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
          }`}
        />
        {isLive ? 'Live' : 'Paused'}
      </span>

      {lastUpdated && (
        <span className="text-[11px] text-slate-500">Updated {getTimeAgoString()}</span>
      )}

      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 transition-colors"
          aria-label="Refresh data"
        >
          <svg
            aria-hidden
            className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
        </button>
      )}

      {onAutoRefreshToggle !== undefined && (
        <label className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => onAutoRefreshToggle(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          Auto
        </label>
      )}
    </div>
  );
}
