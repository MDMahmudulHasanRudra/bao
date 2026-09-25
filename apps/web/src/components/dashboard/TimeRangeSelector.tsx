'use client';

import { useState, useEffect } from 'react';

type TimeRange = '7d' | '30d' | '90d' | 'custom';

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  className?: string;
  customRange?: { from: Date; to: Date };
  onCustomChange?: (range: { from: Date; to: Date }) => void;
}

const RANGES: { value: TimeRange; label: string; days: number }[] = [
  { value: '7d', label: '7 days', days: 7 },
  { value: '30d', label: '30 days', days: 30 },
  { value: '90d', label: '90 days', days: 90 },
];

export function TimeRangeSelector({
  value,
  onChange,
  className = '',
  customRange,
  onCustomChange,
}: TimeRangeSelectorProps) {
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    if (value === 'custom') setShowCustom(true);
  }, [value]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className="flex items-center gap-1 rounded-lg bg-slate-100 p-1"
        role="group"
        aria-label="Time range"
      >
        {RANGES.map(({ value: v, label }) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              setShowCustom(false);
              onChange(v);
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              value === v
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            aria-pressed={value === v}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom(!showCustom)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
            value === 'custom'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
          aria-pressed={value === 'custom'}
          aria-expanded={showCustom}
        >
          Custom
        </button>
      </div>

      {showCustom && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <input
            type="date"
            value={customRange?.from.toISOString().split('T')[0] || ''}
            onChange={(e) => onCustomChange?.({ ...customRange!, from: new Date(e.target.value) })}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500"
            aria-label="From date"
          />
          <span className="text-slate-400">–</span>
          <input
            type="date"
            value={customRange?.to.toISOString().split('T')[0] || ''}
            onChange={(e) => onCustomChange?.({ ...customRange!, to: new Date(e.target.value) })}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500"
            aria-label="To date"
          />
        </div>
      )}
    </div>
  );
}
