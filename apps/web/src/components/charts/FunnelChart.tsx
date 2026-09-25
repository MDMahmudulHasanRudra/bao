'use client';

import { ChartSkeleton } from './ChartSkeleton';

interface FunnelStage {
  stage: string;
  label: string;
  value: number;
  percentage?: number;
  color?: string;
}

interface FunnelChartProps {
  stages: FunnelStage[];
  height?: number;
  loading?: boolean;
  empty?: boolean;
  className?: string;
  showPercentage?: boolean;
  showValue?: boolean;
}

const STAGE_COLORS = [
  '#4f46e5', // indigo
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
];

export function FunnelChart({
  stages,
  height = 350,
  loading = false,
  empty = false,
  className = '',
  showPercentage = true,
  showValue = true,
}: FunnelChartProps) {
  if (loading) return <ChartSkeleton height={height} />;
  if (empty || !stages.length) {
    return (
      <div
        className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center"
        style={{ height }}
      >
        <svg
          className="mx-auto h-12 w-12 text-slate-300"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        <p className="mt-3 text-sm font-medium text-slate-600">No funnel data</p>
        <p className="mt-1 text-sm text-slate-500">Pipeline stages will appear here</p>
      </div>
    );
  }

  const maxValue = Math.max(...stages.map((s) => s.value));
  const sortedStages = [...stages].sort((a, b) => b.value - a.value);

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-5 ${className}`}
      style={{ height }}
    >
      <div className="flex flex-col items-center gap-3">
        {sortedStages.map((stage, index) => {
          const widthPercent = maxValue > 0 ? (stage.value / maxValue) * 100 : 0;
          const color = stage.color || STAGE_COLORS[index % STAGE_COLORS.length];
          const percentage =
            stage.percentage !== undefined
              ? stage.percentage
              : maxValue > 0
                ? Math.round((stage.value / maxValue) * 100)
                : 0;

          return (
            <div
              key={stage.stage}
              className="w-full flex items-center gap-3"
              style={{ maxWidth: '100%' }}
            >
              <div className="w-28 text-right pr-3 text-sm font-medium text-slate-700 truncate">
                {stage.label}
              </div>
              <div className="flex-1 relative" style={{ minWidth: 0 }}>
                <div className="rounded-lg bg-slate-100 h-10 overflow-hidden">
                  <div
                    className="h-full rounded-lg transition-all duration-500 ease-out"
                    style={{
                      width: `${widthPercent}%`,
                      backgroundColor: color,
                      minWidth: widthPercent > 0 ? '24px' : '0',
                    }}
                  />
                </div>
              </div>
              <div className="w-28 flex flex-col items-start text-sm">
                {showValue && (
                  <span className="font-semibold text-slate-900">
                    {stage.value.toLocaleString()}
                  </span>
                )}
                {showPercentage && <span className="text-slate-500">{percentage}%</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
