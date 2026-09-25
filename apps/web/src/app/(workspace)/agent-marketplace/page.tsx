'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { StarRating } from '@/components/dashboard';

type Agent = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  capabilities: string[];
  configSchema: Record<string, unknown>;
  pricing: string;
  priceCents: number;
  currency: string;
  publisherId: string | null;
  version: string;
  status: string;
  iconUrl: string | null;
  readmeUrl: string | null;
  rating: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
};

type Installation = {
  id: string;
  agentId: string;
  config: Record<string, unknown>;
  status: string;
  installedBy: string;
  createdAt: string;
  agent?: Agent;
};

type Review = {
  id: string;
  agentId: string;
  userId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  user?: { id: string; name: string; avatarUrl: string | null };
};

const CATEGORIES = [
  'All',
  'Productivity',
  'Sales',
  'Marketing',
  'Analytics',
  'Support',
  'Development',
  'HR',
  'Finance',
];
const PRICING = ['All', 'free', 'paid', 'subscription'];

function formatPrice(cents: number, currency = 'USD') {
  if (cents === 0) return 'Free';
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function AgentCard({
  agent,
  onInstall,
  onClick,
  installed = false,
}: {
  agent: Agent;
  onInstall?: (id: string) => void;
  onClick?: () => void;
  installed?: boolean;
}) {
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-5 hover:shadow-md transition-shadow"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 shrink-0">
          {agent.iconUrl ? (
            <img src={agent.iconUrl} alt="" className="h-10 w-10 rounded-lg" />
          ) : (
            <svg
              aria-hidden
              className="h-7 w-7 text-slate-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
              <path d="M18 15.5 18.7 17.3 20.5 18l-1.8.7L18 20.5l-.7-1.8L15.5 18l1.8-.7.7-1.8z" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-slate-900 truncate">{agent.name}</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 capitalize">
              {agent.pricing}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 truncate">
            {agent.description || 'No description'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {agent.capabilities.slice(0, 3).map((cap, i) => (
              <span
                key={i}
                className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700"
              >
                {cap}
              </span>
            ))}
            {agent.capabilities.length > 3 && (
              <span className="text-[10px] text-slate-400">
                +{agent.capabilities.length - 3} more
              </span>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3 text-sm">
            <StarRating rating={agent.rating} size={14} />
            <span className="text-slate-500">({agent.reviewCount} reviews)</span>
            <span className="text-slate-400">v{agent.version}</span>
            <span className="font-medium text-indigo-600">
              {formatPrice(agent.priceCents, agent.currency)}
            </span>
          </div>
        </div>
        {onInstall && !installed && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInstall(agent.id);
            }}
            className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Install
          </button>
        )}
        {installed && (
          <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            Installed
          </span>
        )}
      </div>
    </div>
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

export default function AgentMarketplacePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [agentReviews, setAgentReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<'browse' | 'installed'>('browse');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [pricingFilter, setPricingFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [newRating, setNewRating] = useState(0);
  const [newComment, setNewComment] = useState('');

  const installedAgentIds = new Set(installations.map((i) => i.agentId));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== 'All') params.set('category', categoryFilter);
      if (pricingFilter !== 'All') params.set('pricing', pricingFilter);
      if (searchQuery) params.set('q', searchQuery);

      const [{ agents: ags }, { installations: ins }] = await Promise.all([
        api<{ agents: Agent[] }>(`/api/v1/agent-marketplace/agents?${params}`),
        api<{ installations: Installation[] }>('/api/v1/agent-marketplace/installations'),
      ]);
      setAgents(ags);
      setInstallations(ins);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, pricingFilter, searchQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadAgentDetails = useCallback(async (agent: Agent) => {
    setSelectedAgent(agent);
    setReviewsLoading(true);
    try {
      const { reviews } = await api<{ reviews: Review[] }>(
        `/api/v1/agent-marketplace/agents/${agent.id}/reviews`,
      );
      setAgentReviews(reviews);
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  const handleInstall = useCallback(
    async (agentId: string) => {
      setBusy(`install-${agentId}`);
      setFlash(null);
      try {
        await api<{ installation: Installation }>(
          `/api/v1/agent-marketplace/agents/${agentId}/install`,
          {
            method: 'POST',
            body: { config: {} },
          },
        );
        setFlash({ ok: true, text: 'Agent installed successfully' });
        void load();
      } catch (err) {
        setFlash({ ok: false, text: err instanceof Error ? err.message : 'Failed to install' });
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const handleUninstall = useCallback(
    async (installationId: string) => {
      if (!window.confirm('Uninstall this agent?')) return;
      setBusy(`uninstall-${installationId}`);
      setFlash(null);
      try {
        await api<{ ok: boolean }>(`/api/v1/agent-marketplace/installations/${installationId}`, {
          method: 'DELETE',
        });
        setFlash({ ok: true, text: 'Agent uninstalled' });
        void load();
      } catch (err) {
        setFlash({ ok: false, text: err instanceof Error ? err.message : 'Failed to uninstall' });
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const handleSubmitReview = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!selectedAgent || newRating === 0) return;
      setBusy(`review-${selectedAgent.id}`);
      try {
        await api<{ review: Review }>(
          `/api/v1/agent-marketplace/agents/${selectedAgent.id}/reviews`,
          {
            method: 'POST',
            body: { rating: newRating, comment: newComment },
          },
        );
        setFlash({ ok: true, text: 'Review submitted' });
        setNewRating(0);
        setNewComment('');
        await loadAgentDetails(selectedAgent);
      } catch (err) {
        setFlash({
          ok: false,
          text: err instanceof Error ? err.message : 'Failed to submit review',
        });
      } finally {
        setBusy(null);
      }
    },
    [selectedAgent, loadAgentDetails],
  );

  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500"
      >
        Loading marketplace…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="mx-auto max-w-5xl rounded-xl border border-red-200 bg-white p-6">
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

  const filteredAgents = agents.filter((a) => {
    if (categoryFilter !== 'All' && a.category !== categoryFilter) return false;
    if (pricingFilter !== 'All' && a.pricing !== pricingFilter) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Agent Marketplace</h1>
          <p className="text-sm text-slate-500">
            Discover and install AI agents to extend your workflow.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-white"
        >
          Refresh
        </button>
      </div>

      {flash && (
        <div
          role={flash.ok ? 'status' : 'alert'}
          className={`rounded-lg border px-4 py-3 text-sm ${flash.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}
        >
          {flash.text}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
          {['browse', 'installed'].map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab as 'browse' | 'installed')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${activeTab === tab ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {tab === 'browse' ? 'Browse' : 'Installed'}
            </button>
          ))}
        </div>
        {activeTab === 'browse' && (
          <>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={pricingFilter}
              onChange={(e) => setPricingFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600"
            >
              {PRICING.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <input
              type="search"
              placeholder="Search agents…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm w-64"
            />
          </>
        )}
      </div>

      {activeTab === 'browse' ? (
        filteredAgents.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <svg
              aria-hidden
              className="mx-auto h-12 w-12 text-slate-300"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
              <path d="M18 15.5 18.7 17.3 20.5 18l-1.8.7L18 20.5l-.7-1.8L15.5 18l1.8-.7.7-1.8z" />
            </svg>
            <p className="mt-4 text-sm font-medium text-slate-600">No agents found</p>
            <p className="mt-1 text-sm text-slate-500">
              Try adjusting your filters or search query.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredAgents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                installed={installedAgentIds.has(agent.id)}
                onInstall={handleInstall}
                onClick={() => loadAgentDetails(agent)}
              />
            ))}
          </div>
        )
      ) : installations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <svg
            aria-hidden
            className="mx-auto h-12 w-12 text-slate-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
            <path d="M18 15.5 18.7 17.3 20.5 18l-1.8.7L18 20.5l-.7-1.8L15.5 18l1.8-.7.7-1.8z" />
          </svg>
          <p className="mt-4 text-sm font-medium text-slate-600">No agents installed</p>
          <p className="mt-1 text-sm text-slate-500">
            Browse the marketplace and install agents to see them here.
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('browse')}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Browse Marketplace
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {installations.map((inst) => (
            <div
              key={inst.id}
              className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 shrink-0">
                  <svg
                    aria-hidden
                    className="h-6 w-6 text-slate-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-slate-900">
                    {inst.agent?.name || 'Unknown Agent'}
                  </p>
                  <p className="text-sm text-slate-500">Installed {formatDate(inst.createdAt)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleUninstall(inst.id)}
                disabled={busy === `uninstall-${inst.id}`}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Uninstall
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedAgent && (
        <Modal
          open={true}
          onClose={() => {
            setSelectedAgent(null);
            setAgentReviews([]);
          }}
          title={selectedAgent.name}
          footer={
            <>
              <button
                type="button"
                onClick={() => {
                  setSelectedAgent(null);
                  setAgentReviews([]);
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-white"
              >
                Close
              </button>
              {!installedAgentIds.has(selectedAgent.id) && (
                <button
                  type="button"
                  onClick={() => void handleInstall(selectedAgent.id)}
                  disabled={busy === `install-${selectedAgent.id}`}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy === `install-${selectedAgent.id}` ? 'Installing…' : 'Install Agent'}
                </button>
              )}
            </>
          }
        >
          <div className="space-y-6">
            <div>
              <p className="text-sm text-slate-500">
                {selectedAgent.description || 'No description available.'}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 capitalize">
                  {selectedAgent.category}
                </span>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
                  {selectedAgent.pricing}
                </span>
                <span className="font-medium text-indigo-600">
                  {formatPrice(selectedAgent.priceCents, selectedAgent.currency)}
                </span>
                <span className="text-slate-400">v{selectedAgent.version}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedAgent.capabilities.map((cap, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <StarRating rating={selectedAgent.rating} size={24} />
              <div>
                <p className="text-lg font-semibold text-slate-900">
                  {selectedAgent.rating.toFixed(1)}
                </p>
                <p className="text-sm text-slate-500">
                  Based on {selectedAgent.reviewCount} reviews
                </p>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-6">
              <h3 className="font-semibold text-slate-900">Reviews</h3>
              {reviewsLoading ? (
                <div className="mt-4 space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-16 w-full rounded bg-slate-100 animate-pulse" />
                  ))}
                </div>
              ) : agentReviews.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  No reviews yet. Be the first to review!
                </p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {agentReviews.map((review) => (
                    <li key={review.id} className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 text-sm font-semibold">
                            {review.user?.name?.slice(0, 1).toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">
                              {review.user?.name || 'Anonymous'}
                            </p>
                            <p className="text-xs text-slate-500">{formatDate(review.createdAt)}</p>
                          </div>
                        </div>
                        <StarRating rating={review.rating} size={18} />
                      </div>
                      {review.comment && (
                        <p className="mt-2 text-sm text-slate-700">{review.comment}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {installedAgentIds.has(selectedAgent.id) && (
                <form onSubmit={handleSubmitReview} className="mt-6 space-y-3">
                  <h4 className="font-medium text-slate-900">Write a review</h4>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-2">Rating</label>
                    <div className="flex items-center gap-2" role="radiogroup" aria-label="Rating">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          role="radio"
                          aria-checked={newRating === star}
                          onClick={() => setNewRating(star)}
                          className="p-2 rounded-lg border-2 transition-colors"
                          style={{
                            borderColor: newRating >= star ? '#4f46e5' : '#e2e8f0',
                            backgroundColor: newRating >= star ? '#eef2ff' : 'transparent',
                          }}
                        >
                          <StarRating rating={star} size={20} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="review-comment"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Comment (optional)
                    </label>
                    <textarea
                      id="review-comment"
                      rows={3}
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      placeholder="What did you think?"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy === `review-${selectedAgent.id}` || newRating === 0}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {busy === `review-${selectedAgent.id}` ? 'Submitting…' : 'Submit Review'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
