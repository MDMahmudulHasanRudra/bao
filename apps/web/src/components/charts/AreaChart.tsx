'use client';

import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ChartSkeleton } from './ChartSkeleton';

// x-axis field is chosen per-chart via xKey, so rows are only constrained to scalars
interface DataPoint {
  [key: string]: string | number;
}

interface AreaChartProps {
  data: DataPoint[];
  xKey: string;
  yKeys: { key: string; label: string; color: string; fillOpacity?: number }[];
  height?: number;
  loading?: boolean;
  empty?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  stacked?: boolean;
  tooltipFormatter?: (value: number, name: string) => [string, string];
}

export function AreaChart({
  data,
  xKey,
  yKeys,
  height = 300,
  loading = false,
  empty = false,
  showLegend = true,
  animate = true,
  className = '',
  stacked = false,
  tooltipFormatter,
}: AreaChartProps) {
  if (loading) return <ChartSkeleton height={height} />;
  if (empty || !data.length) {
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
          <path d="M3 3v18h18" />
          <path d="M7 14l4-4 4 4 5-6" />
        </svg>
        <p className="mt-3 text-sm font-medium text-slate-600">No data available</p>
        <p className="mt-1 text-sm text-slate-500">Select a different time range or add data</p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart
          data={data}
          margin={{ top: 10, right: showLegend ? 20 : 10, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            opacity={0.3}
            vertical={false}
            stroke="currentColor"
          />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) =>
              value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)
            }
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            }}
            labelFormatter={(date: string) =>
              new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            }
            formatter={tooltipFormatter}
          />
          {showLegend && (
            <Legend
              layout="horizontal"
              align="center"
              verticalAlign="top"
              wrapperStyle={{ paddingTop: 20 }}
              iconType="circle"
              iconSize={8}
            />
          )}
          {yKeys.map(({ key, label, color, fillOpacity = 0.15 }) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              name={label}
              stroke={color}
              fill={color}
              fillOpacity={fillOpacity}
              strokeWidth={2}
              stackId={stacked ? 'a' : undefined}
              animationDuration={animate ? 800 : 0}
              animationEasing="ease-out"
            />
          ))}
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
