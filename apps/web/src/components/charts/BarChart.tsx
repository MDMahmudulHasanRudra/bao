'use client';

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';
import { ChartSkeleton } from './ChartSkeleton';

// x-axis field is chosen per-chart via xKey, so rows are only constrained to scalars
interface DataPoint {
  [key: string]: string | number;
}

interface BarChartProps {
  data: DataPoint[];
  xKey: string;
  yKeys: { key: string; label: string; color: string }[];
  height?: number;
  loading?: boolean;
  empty?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  horizontal?: boolean;
  tooltipFormatter?: (value: number, name: string) => [string, string];
  maxBarSize?: number;
}

export function BarChart({
  data,
  xKey,
  yKeys,
  height = 300,
  loading = false,
  empty = false,
  showLegend = true,
  animate = true,
  className = '',
  horizontal = false,
  tooltipFormatter,
  maxBarSize = 40,
}: BarChartProps) {
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
        {horizontal ? (
          <RechartsBarChart
            layout="vertical"
            data={data}
            margin={{ top: 10, right: 10, left: showLegend ? 80 : 20, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              opacity={0.3}
              horizontal={false}
              stroke="currentColor"
            />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              width={showLegend ? 100 : 80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
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
            {yKeys.map(({ key, label, color }) => (
              <Bar
                key={key}
                dataKey={key}
                name={label}
                fill={color}
                maxBarSize={maxBarSize}
                radius={[0, 4, 4, 0]}
                animationDuration={animate ? 800 : 0}
                animationEasing="ease-out"
              >
                <Cell fill={color} />
              </Bar>
            ))}
          </RechartsBarChart>
        ) : (
          <RechartsBarChart
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
            {yKeys.map(({ key, label, color }) => (
              <Bar
                key={key}
                dataKey={key}
                name={label}
                fill={color}
                maxBarSize={maxBarSize}
                radius={[4, 4, 0, 0]}
                animationDuration={animate ? 800 : 0}
                animationEasing="ease-out"
              >
                <Cell fill={color} />
              </Bar>
            ))}
          </RechartsBarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
