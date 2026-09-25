'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Workflow = {
  id: string;
  name: string;
  description: string | null;
  trigger: { type: string; config: Record<string, unknown> };
  conditions: Record<string, unknown>;
  actions: Array<{ type: string; config: Record<string, unknown> }>;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
};

type Run = {
  id: string;
  workflowId: string;
  status: string;
  triggerData: Record<string, unknown>;
  result: Record<string, unknown>;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-700',
    running: 'bg-indigo-100 text-indigo-700',
    completed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || 'bg-slate-100 text-slate-700'}`}
    >
      {status}
    </span>
  );
}

function triggerBadge(type: string) {
  const labels: Record<string, string> = {
    lead_created: 'Lead Created',
    stage_changed: 'Stage Changed',
    activity_due: 'Activity Due',
    schedule: 'Scheduled',
    webhook: 'Webhook',
  };
  return (
    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
      {labels[type] || type}
    </span>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 ${className}`}>{children}</div>
  );
}

function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="modal-title" className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <svg
              aria-hidden
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AutomationPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);

  const [busy, setBusy] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    triggerType: 'lead_created' as
      'lead_created' | 'stage_changed' | 'activity_due' | 'schedule' | 'webhook',
    triggerConfig: {} as Record<string, unknown>,
    conditions: {} as Record<string, unknown>,
    actions: [] as Array<{ type: string; config: Record<string, unknown> }>,
    enabled: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { workflows: wfs } = await api<{ workflows: Workflow[] }>(
        '/api/v1/automation/workflows',
      );
      setWorkflows(wfs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadRuns(workflowId: string) {
    try {
      const { runs: rs } = await api<{ runs: Run[] }>(
        `/api/v1/automation/workflows/${workflowId}/runs`,
      );
      setRuns(rs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runs');
    }
  }

  function openCreate() {
    setEditingWorkflow(null);
    setForm({
      name: '',
      description: '',
      triggerType: 'lead_created',
      triggerConfig: {},
      conditions: {},
      actions: [],
      enabled: true,
    });
    setModalOpen(true);
  }

  function openEdit(wf: Workflow) {
    setEditingWorkflow(wf);
    setForm({
      name: wf.name,
      description: wf.description || '',
      triggerType: wf.trigger.type as typeof form.triggerType,
      triggerConfig: wf.trigger.config,
      conditions: wf.conditions,
      actions: wf.actions,
      enabled: wf.enabled,
    });
    setModalOpen(true);
  }

  async function handleSubmit() {
    setBusy('save');
    setFlash(null);
    try {
      const body = {
        name: form.name,
        description: form.description || undefined,
        trigger: { type: form.triggerType, config: form.triggerConfig },
        conditions: form.conditions,
        actions: form.actions,
        enabled: form.enabled,
      };
      if (editingWorkflow) {
        await api<{ workflow: Workflow }>(`/api/v1/automation/workflows/${editingWorkflow.id}`, {
          method: 'PATCH',
          body,
        });
        setFlash({ ok: true, text: 'Workflow updated' });
      } else {
        await api<{ workflow: Workflow }>('/api/v1/automation/workflows', { method: 'POST', body });
        setFlash({ ok: true, text: 'Workflow created' });
      }
      setModalOpen(false);
      void load();
    } catch (err) {
      setFlash({ ok: false, text: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setBusy(null);
    }
  }

  async function handleRun(workflowId: string) {
    setBusy(`run-${workflowId}`);
    setFlash(null);
    try {
      await api<{ run: Run }>(`/api/v1/automation/workflows/${workflowId}/run`, {
        method: 'POST',
        body: {},
      });
      setFlash({ ok: true, text: 'Workflow started' });
      void load();
    } catch (err) {
      setFlash({ ok: false, text: err instanceof Error ? err.message : 'Failed to run' });
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(workflowId: string) {
    if (!window.confirm('Delete this workflow? This cannot be undone.')) return;
    setBusy(`delete-${workflowId}`);
    setFlash(null);
    try {
      await api<{ ok: boolean }>(`/api/v1/automation/workflows/${workflowId}`, {
        method: 'DELETE',
      });
      setFlash({ ok: true, text: 'Workflow deleted' });
      void load();
    } catch (err) {
      setFlash({ ok: false, text: err instanceof Error ? err.message : 'Failed to delete' });
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleEnabled(wf: Workflow) {
    setBusy(`toggle-${wf.id}`);
    try {
      await api<{ workflow: Workflow }>(`/api/v1/automation/workflows/${wf.id}`, {
        method: 'PATCH',
        body: { enabled: !wf.enabled },
      });
      void load();
    } catch (err) {
      setFlash({ ok: false, text: err instanceof Error ? err.message : 'Failed to toggle' });
    } finally {
      setBusy(null);
    }
  }

  async function handleViewRuns(workflowId: string) {
    const wf = workflows.find((w) => w.id === workflowId);
    if (wf) setSelectedWorkflow(wf);
    await loadRuns(workflowId);
  }

  async function handleRetryRun(runId: string) {
    setBusy(`retry-${runId}`);
    setFlash(null);
    try {
      await api<{ run: Run }>(`/api/v1/automation/runs/${runId}/retry`, { method: 'POST' });
      setFlash({ ok: true, text: 'Run retried' });
      if (selectedWorkflow) await loadRuns(selectedWorkflow.id);
    } catch (err) {
      setFlash({ ok: false, text: err instanceof Error ? err.message : 'Failed to retry' });
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500"
      >
        Loading automations…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="mx-auto max-w-4xl rounded-xl border border-red-200 bg-white p-6">
        <p className="text-sm text-slate-700">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Automation</h1>
          <p className="text-sm text-slate-500">
            Create CRM automation sequences to streamline your sales process.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Create Workflow
        </button>
      </div>

      {flash && (
        <p
          role={flash.ok ? 'status' : 'alert'}
          className={`rounded-lg border px-3 py-2 text-sm ${flash.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}
        >
          {flash.text}
        </p>
      )}

      {workflows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <svg
            aria-hidden
            className="mx-auto h-12 w-12 text-slate-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M9 12l2 2 4-4" />
            <path d="M12 2v20M2 12h20" />
          </svg>
          <p className="mt-4 text-sm font-medium text-slate-600">No automations yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Create your first automation sequence to automate repetitive tasks.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Create Workflow
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map((wf) => (
            <Card key={wf.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-900 truncate">{wf.name}</p>
                    {triggerBadge(wf.trigger.type)}
                    {statusBadge(wf.enabled ? 'active' : 'inactive')}
                  </div>
                  {wf.description && (
                    <p className="mt-1 text-sm text-slate-500 truncate">{wf.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <span>Runs: {wf.runCount}</span>
                    <span>Last run: {formatDate(wf.lastRunAt)}</span>
                    <span>Next run: {formatDate(wf.nextRunAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wf.enabled}
                      onChange={() => void handleToggleEnabled(wf)}
                      disabled={busy === `toggle-${wf.id}`}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      aria-label={wf.enabled ? 'Disable' : 'Enable'}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleViewRuns(wf.id)}
                    disabled={busy === `run-${wf.id}`}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-white disabled:opacity-50"
                  >
                    View Runs
                  </button>
                  <button
                    type="button"
                    onClick={() => void openEdit(wf)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-white"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRun(wf.id)}
                    disabled={busy === `run-${wf.id}` || !wf.enabled}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {busy === `run-${wf.id}` ? 'Running…' : 'Run'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(wf.id)}
                    disabled={busy === `delete-${wf.id}`}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {selectedWorkflow && (
        <Modal
          open={true}
          onClose={() => setSelectedWorkflow(null)}
          title={`Runs for "${selectedWorkflow.name}"`}
          footer={
            <button
              type="button"
              onClick={() => setSelectedWorkflow(null)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white"
            >
              Close
            </button>
          }
        >
          {runs.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No runs yet.</p>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Started</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Completed</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Result</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td className="px-4 py-3">{statusBadge(run.status)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(run.startedAt)}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(run.completedAt)}</td>
                      <td className="px-4 py-3 text-slate-700 max-w-xs truncate">
                        {run.status === 'completed'
                          ? 'Completed successfully'
                          : run.status === 'failed'
                            ? run.error || 'Failed'
                            : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {run.status === 'failed' && (
                          <button
                            type="button"
                            onClick={() => void handleRetryRun(run.id)}
                            disabled={busy === `retry-${run.id}`}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-white disabled:opacity-50"
                          >
                            Retry
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingWorkflow ? 'Edit Workflow' : 'Create Workflow'}
        footer={
          <>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={busy === 'save'}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy === 'save' ? 'Saving…' : editingWorkflow ? 'Save Changes' : 'Create Workflow'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="wf-name" className="block text-xs font-medium text-slate-600">
              Name <span aria-hidden>*</span>
            </label>
            <input
              id="wf-name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="e.g., New Lead Welcome Sequence"
            />
          </div>
          <div>
            <label htmlFor="wf-desc" className="block text-xs font-medium text-slate-600">
              Description
            </label>
            <textarea
              id="wf-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="What does this workflow do?"
            />
          </div>
          <div>
            <label htmlFor="wf-trigger" className="block text-xs font-medium text-slate-600">
              Trigger <span aria-hidden>*</span>
            </label>
            <select
              id="wf-trigger"
              value={form.triggerType}
              onChange={(e) =>
                setForm({ ...form, triggerType: e.target.value as typeof form.triggerType })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="lead_created">Lead Created</option>
              <option value="stage_changed">Stage Changed</option>
              <option value="activity_due">Activity Due</option>
              <option value="schedule">Scheduled</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Enabled</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="checkbox"
                id="wf-enabled"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="wf-enabled" className="text-sm text-slate-600">
                Active
              </label>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Advanced: Conditions and Actions are configured via API in this version. Full visual
            builder coming soon.
          </p>
        </form>
      </Modal>
    </div>
  );
}
