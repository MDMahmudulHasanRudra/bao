import type { ReactNode } from 'react';

/**
 * Spec 5: one plain-language status vocabulary shared by every durable
 * operation, so a human never has to learn a new set of words per module.
 *
 * The eight states are the spec's list. `waiting_for_input` and `draft` are
 * included because they are part of the shared language, but no current
 * operation stores a signal for them, so nothing maps to them yet. They were
 * left in place rather than silently dropped so the vocabulary stays a
 * contract; remove one when a domain actually records that state.
 */
export type OperationState =
  | 'draft'
  | 'queued'
  | 'running'
  | 'waiting_for_input'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed'
  | 'cancelled';

export const OPERATION_STATE_LABEL: Record<OperationState, string> = {
  draft: 'Draft',
  queued: 'Queued',
  running: 'Running',
  waiting_for_input: 'Waiting for input',
  completed: 'Completed',
  completed_with_warnings: 'Completed with warnings',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const TONE: Record<OperationState, string> = {
  draft: 'bg-slate-100 text-slate-600',
  queued: 'bg-slate-100 text-slate-700',
  running: 'bg-sky-100 text-sky-700',
  waiting_for_input: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
  completed_with_warnings: 'bg-amber-100 text-amber-800',
  failed: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

/** True while the operation can still change on its own. Drives polling. */
export function isInFlight(state: OperationState): boolean {
  return state === 'queued' || state === 'running' || state === 'waiting_for_input';
}

export function OperationBadge({ state }: { state: OperationState }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[state]}`}>
      {OPERATION_STATE_LABEL[state]}
    </span>
  );
}

export function OperationCard({
  title,
  state,
  stage,
  summary,
  nextStep,
  meta,
  progress,
  error,
  actions,
  children,
}: {
  /** Plain-language name of the operation, not a table name. */
  title: string;
  state: OperationState;
  /** What it is doing right now, in words. */
  stage?: string;
  /** What it did, once it is over. */
  summary?: string;
  /** What a human should do next. Omitted when nothing is needed. */
  nextStep?: string;
  /** Where the state is stored and how fresh it is. */
  meta?: string;
  progress?: { done: number; total: number; label?: string };
  error?: string | null;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const pct = progress && progress.total > 0 ? Math.min(100, (progress.done / progress.total) * 100) : 0;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <OperationBadge state={state} />
          </div>
          {meta && <p className="mt-0.5 text-xs text-slate-500">{meta}</p>}
        </div>
        {actions}
      </div>

      {stage && <p className="mt-2 text-sm text-slate-700">{stage}</p>}

      {progress && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{progress.label ?? 'Progress'}</span>
            <span>
              {progress.done} of {progress.total}
            </span>
          </div>
          <div
            className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            aria-label={progress.label ?? 'Progress'}
          >
            <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {summary && <p className="mt-3 text-sm text-slate-700">{summary}</p>}

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {nextStep && (
        <p className="mt-3 text-xs text-slate-600">
          <span className="font-medium text-slate-700">What to do next:</span> {nextStep}
        </p>
      )}

      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Domain mappers. These are the only place a stored enum becomes a human word.
// Both read the columns the server already returns; no request is invented.
// ---------------------------------------------------------------------------

export type StoredOperation = {
  status: string;
  error?: string | null;
  progress?: { processed?: number; failed?: number; total?: number; discovered?: number } | null;
  stats?: { errors?: number; candidatesFound?: number; pagesCrawled?: number } | null;
  chunkCount?: number | null;
  metadata?: { error?: string } | null;
};

/** research_jobs.status → shared vocabulary. */
export function researchOperationState(op: StoredOperation): OperationState {
  switch (op.status) {
    case 'queued':
      return 'queued';
    case 'discovering':
    case 'analyzing':
      return 'running';
    case 'completed':
      // Completed with warnings is derived from real counters, never guessed.
      return (op.progress?.failed ?? 0) > 0 || (op.stats?.errors ?? 0) > 0
        ? 'completed_with_warnings'
        : 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'failed';
  }
}

/** knowledge_sources.status → shared vocabulary. */
export function sourceOperationState(op: StoredOperation): OperationState {
  switch (op.status) {
    case 'pending':
      return 'queued';
    case 'processing':
      return 'running';
    case 'ready':
      return 'completed';
    case 'error':
      return 'failed';
    default:
      return 'failed';
  }
}

export function sourceOperationError(op: StoredOperation): string | null {
  return op.status === 'error' ? (op.metadata?.error ?? 'The document could not be read.') : null;
}
