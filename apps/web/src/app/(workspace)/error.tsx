'use client';

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="mx-auto max-w-md rounded-xl border border-red-200 bg-white p-6">
      <h1 className="text-base font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        {error.message || 'Unexpected application error.'}
      </p>
      {error.digest && <p className="mt-1 text-xs text-slate-400">Ref: {error.digest}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Go back
        </button>
      </div>
    </div>
  );
}
