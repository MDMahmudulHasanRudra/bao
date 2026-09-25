'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type WorkflowNode = {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'delay' | 'webhook';
  position: { x: number; y: number };
  config: Record<string, unknown>;
  name?: string;
};

type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
};

type WorkflowDefinition = {
  id: string;
  name: string;
  description: string | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Execution = {
  id: string;
  definitionId: string;
  status: string;
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
};

const NODE_TYPES = [
  { type: 'trigger', label: 'Trigger', color: '#10b981', icon: '⚡' },
  { type: 'action', label: 'Action', color: '#3b82f6', icon: '⚙️' },
  { type: 'condition', label: 'Condition', color: '#f59e0b', icon: '❓' },
  { type: 'delay', label: 'Delay', color: '#8b5cf6', icon: '⏱️' },
  { type: 'webhook', label: 'Webhook', color: '#ec4899', icon: '🔗' },
] as const;

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-700',
    running: 'bg-indigo-100 text-indigo-700',
    completed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
    cancelled: 'bg-slate-100 text-slate-700',
    skipped: 'bg-amber-100 text-amber-700',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || 'bg-slate-100 text-slate-700'}`}
    >
      {status}
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
      role="dialog"
      aria-modal="true"
      aria-labelledby="wf-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="wf-modal-title" className="text-lg font-semibold text-slate-900">
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

function Canvas({ nodes, edges }: { nodes: WorkflowNode[]; edges: WorkflowEdge[] }) {
  return (
    <div className="relative h-[400px] w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        {edges.map((edge) => {
          const source = nodes.find((n) => n.id === edge.source);
          const target = nodes.find((n) => n.id === edge.target);
          if (!source || !target) return null;
          const sx = source.position.x + 90;
          const sy = source.position.y + 40;
          const tx = target.position.x + 90;
          const ty = target.position.y + 40;
          return (
            <path
              key={edge.id}
              d={`M${sx} ${sy} C ${sx + 80} ${sy}, ${tx - 80} ${ty}, ${tx} ${ty}`}
              stroke="#94a3b8"
              strokeWidth="2"
              fill="none"
              markerEnd="url(#wf-arrowhead)"
            />
          );
        })}
        <defs>
          <marker
            id="wf-arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
          </marker>
        </defs>
      </svg>
      {nodes.map((node) => {
        const nodeType = NODE_TYPES.find((nt) => nt.type === node.type);
        return (
          <div
            key={node.id}
            className="absolute w-[180px] rounded-xl border-2 bg-white p-3 shadow-md"
            style={{ left: node.position.x, top: node.position.y, borderColor: nodeType?.color }}
          >
            <div className="flex items-center gap-1.5">
              <span aria-hidden className="text-xl">
                {nodeType?.icon}
              </span>
              <span className="truncate font-medium text-slate-900">{node.name || node.id}</span>
            </div>
            <span
              className="mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: `${nodeType?.color}20`, color: nodeType?.color }}
            >
              {nodeType?.label}
            </span>
          </div>
        );
      })}
      {nodes.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
          Add nodes from the palette to start building
        </p>
      )}
    </div>
  );
}

function Palette({ onAddNode }: { onAddNode: (type: WorkflowNode['type']) => void }) {
  return (
    <div className="flex w-44 flex-col gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="px-1 text-xs font-semibold text-slate-600">Palette</p>
      {NODE_TYPES.map((nt) => (
        <button
          key={nt.type}
          type="button"
          onClick={() => onAddNode(nt.type)}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
          style={{ borderLeftColor: nt.color, borderLeftWidth: '3px' }}
        >
          <span aria-hidden>{nt.icon}</span>
          {nt.label}
        </button>
      ))}
    </div>
  );
}

export default function WorkflowBuilderPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([]);
  const [selectedDefinition, setSelectedDefinition] = useState<WorkflowDefinition | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState<WorkflowDefinition | null>(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    nodes: [] as WorkflowNode[],
    edges: [] as WorkflowEdge[],
    isActive: false,
  });

  const loadDefinitions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ definitions: WorkflowDefinition[] }>(
        '/api/v1/workflow-builder/definitions',
      );
      setDefinitions(res.definitions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflows');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDefinitions();
  }, [loadDefinitions]);

  const loadExecutions = useCallback(async (definitionId: string) => {
    try {
      const res = await api<{ executions: Execution[] }>(
        `/api/v1/workflow-builder/definitions/${definitionId}/executions`,
      );
      setExecutions(res.executions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load executions');
    }
  }, []);

  const closeExecutions = useCallback(() => {
    setSelectedDefinition(null);
    setExecutions([]);
  }, []);

  const openCreate = useCallback(() => {
    setEditingDefinition(null);
    setForm({ name: '', description: '', nodes: [], edges: [], isActive: false });
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((def: WorkflowDefinition) => {
    setEditingDefinition(def);
    setForm({
      name: def.name,
      description: def.description || '',
      nodes: def.nodes,
      edges: def.edges,
      isActive: def.isActive,
    });
    setModalOpen(true);
  }, []);

  const save = useCallback(async () => {
    setBusy('save');
    setFlash(null);
    try {
      if (editingDefinition) {
        await api(`/api/v1/workflow-builder/definitions/${editingDefinition.id}`, {
          method: 'PATCH',
          body: form,
        });
        setFlash({ ok: true, text: 'Workflow updated' });
      } else {
        await api('/api/v1/workflow-builder/definitions', { method: 'POST', body: form });
        setFlash({ ok: true, text: 'Workflow created' });
      }
      setModalOpen(false);
      await loadDefinitions();
    } catch (err) {
      setFlash({ ok: false, text: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setBusy(null);
    }
  }, [editingDefinition, form, loadDefinitions]);

  const handleRun = useCallback(
    async (definitionId: string) => {
      setBusy(`run-${definitionId}`);
      setFlash(null);
      try {
        await api(`/api/v1/workflow-builder/definitions/${definitionId}/execute`, {
          method: 'POST',
          body: { inputData: {} },
        });
        setFlash({ ok: true, text: 'Workflow executed' });
        if (selectedDefinition?.id === definitionId) await loadExecutions(definitionId);
      } catch (err) {
        setFlash({ ok: false, text: err instanceof Error ? err.message : 'Failed to run' });
      } finally {
        setBusy(null);
      }
    },
    [loadExecutions, selectedDefinition],
  );

  const handleDelete = useCallback(
    async (definitionId: string) => {
      if (!window.confirm('Delete this workflow? This cannot be undone.')) return;
      setBusy(`delete-${definitionId}`);
      setFlash(null);
      try {
        await api(`/api/v1/workflow-builder/definitions/${definitionId}`, { method: 'DELETE' });
        setFlash({ ok: true, text: 'Workflow deleted' });
        await loadDefinitions();
      } catch (err) {
        setFlash({ ok: false, text: err instanceof Error ? err.message : 'Failed to delete' });
      } finally {
        setBusy(null);
      }
    },
    [loadDefinitions],
  );

  const handleViewExecutions = useCallback(
    async (definitionId: string) => {
      const def = definitions.find((d) => d.id === definitionId);
      if (def) setSelectedDefinition(def);
      await loadExecutions(definitionId);
    },
    [definitions, loadExecutions],
  );

  const handleRetryExecution = useCallback(
    async (executionId: string) => {
      setBusy(`retry-${executionId}`);
      setFlash(null);
      try {
        await api(`/api/v1/workflow-builder/executions/${executionId}/retry`, { method: 'POST' });
        setFlash({ ok: true, text: 'Execution retried' });
        if (selectedDefinition) await loadExecutions(selectedDefinition.id);
      } catch (err) {
        setFlash({ ok: false, text: err instanceof Error ? err.message : 'Failed to retry' });
      } finally {
        setBusy(null);
      }
    },
    [loadExecutions, selectedDefinition],
  );

  // ponytail: sequential placement, not free-form drag. Add a real drag layer when
  // users actually reposition nodes by hand.
  const handleAddNode = useCallback((type: WorkflowNode['type']) => {
    setForm((prev) => ({
      ...prev,
      nodes: [
        ...prev.nodes,
        {
          id: `node-${prev.nodes.length + 1}`,
          type,
          position: { x: 40 + prev.nodes.length * 20, y: 40 + prev.nodes.length * 80 },
          config: {},
        },
      ],
    }));
  }, []);

  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500"
      >
        Loading workflows…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Workflow Builder</h1>
          <p className="mt-1 text-sm text-slate-500">
            Design, run, and monitor automated business processes.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          New Workflow
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}
      {flash && (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${flash.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}
        >
          {flash.text}
        </div>
      )}

      {definitions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm font-medium text-slate-600">No workflows yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Create your first workflow to automate business processes.
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {definitions.map((def) => (
            <Card key={def.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{def.name}</p>
                  <p className="mt-1 truncate text-sm text-slate-500">
                    {def.description || 'No description'}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <span>v{def.version}</span>
                    <span>{def.nodes.length} nodes</span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-medium ${def.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                    >
                      {def.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleRun(def.id)}
                  disabled={busy === `run-${def.id}`}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Run
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(def)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void handleViewExecutions(def.id)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                >
                  History
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(def.id)}
                  disabled={busy === `delete-${def.id}`}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={selectedDefinition !== null}
        onClose={closeExecutions}
        title={selectedDefinition ? `Executions — ${selectedDefinition.name}` : 'Executions'}
        footer={
          <button
            type="button"
            onClick={closeExecutions}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        }
      >
        {executions.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No executions yet.</p>
        ) : (
          <div className="max-h-[500px] overflow-y-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
                    Started
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
                    Completed
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
                    Input
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
                    Output
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {executions.map((exec) => (
                  <tr key={exec.id}>
                    <td className="px-4 py-3">{statusBadge(exec.status)}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(exec.startedAt)}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(exec.completedAt)}</td>
                    <td className="max-w-[12rem] truncate px-4 py-3 text-slate-700">
                      {JSON.stringify(exec.inputData)}
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-3 text-slate-700">
                      {JSON.stringify(exec.outputData)}
                    </td>
                    <td className="px-4 py-3">
                      {exec.status === 'failed' && (
                        <button
                          type="button"
                          onClick={() => void handleRetryExecution(exec.id)}
                          disabled={busy === `retry-${exec.id}`}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingDefinition ? 'Edit Workflow' : 'Create Workflow'}
        footer={
          <>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy === 'save' || !form.name.trim()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy === 'save' ? 'Saving…' : editingDefinition ? 'Save Changes' : 'Create Workflow'}
            </button>
          </>
        }
      >
        <form
          className="max-h-[60vh] space-y-4 overflow-y-auto"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div>
            <label htmlFor="wf-name" className="block text-xs font-medium text-slate-600">
              Name
            </label>
            <input
              id="wf-name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="e.g., Lead Qualification Workflow"
            />
          </div>
          <div>
            <label htmlFor="wf-desc" className="block text-xs font-medium text-slate-600">
              Description
            </label>
            <textarea
              id="wf-desc"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="What does this workflow do?"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="wf-active"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="wf-active" className="text-sm text-slate-600">
              Active
            </label>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h3 className="mb-1 font-medium text-slate-900">Builder</h3>
            <p className="mb-3 text-xs text-slate-500">
              Add nodes from the palette. Edges are derived from trigger → action order.
            </p>
            <div className="flex gap-4">
              <Palette onAddNode={handleAddNode} />
              <div className="min-w-0 flex-1">
                <Canvas nodes={form.nodes} edges={form.edges} />
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
