'use client';

export function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" style={{ height }}>
      <div className="space-y-3">
        <div className="h-6 w-3/12 rounded bg-slate-200 animate-pulse" />
        <div className="h-4 w-2/12 rounded bg-slate-200 animate-pulse" />
        <div className="mt-4 h-[calc(100%-60px)] w-full rounded bg-slate-100 animate-pulse" />
      </div>
    </div>
  );
}
