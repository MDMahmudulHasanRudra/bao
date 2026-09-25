'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';

type JobStatus = 'queued' | 'discovering' | 'analyzing' | 'completed' | 'failed' | 'cancelled';
type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

type Task = {
  id: string;
  type: string;
  status: TaskStatus;
  target?: string | null;
  error?: string | null;
};

type Job = {
  id: string;
  name: string;
  depth: string;
  status: JobStatus;
  error?: string | null;
  progress?: { discovered: number; processed: number; qualified: number; failed: number; total: number } | null;
  stats?: {
    companiesDiscovered: number;
    candidatesFound: number;
    pagesCrawled: number;
    aiCalls: number;
    errors: number;
  } | null;
  createdAt: string;
  updatedAt: string;
  tasks?: Task[];
};

type Candidate = {
  id: string;
  companyName: string;
  normalizedDomain?: string | null;
  website?: string | null;
  industry?: string | null;
  country?: string | null;
  employeeMin?: number | null;
  employeeMax?: number | null;
  summary?: string | null;
  score?: number | null;
  scoreReasons?: string[] | null;
  icpMatch?: Record<string, string> | null;
  status: string;
};

type Signal = {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  confidence?: number | null;
  sourceUrl?: string | null;
  detectedAt: string;
};

type Evidence = {
  id: string;
  claim: string;
  snippet?: string | null;
  sourceUrl: string;
  retrievedAt?: string | null;
};

type CandidateDetail = Candidate & { signals: Signal[]; evidence: Evidence[] };

type IcpMatch = 'match' | 'unknown' | 'no_match';

const TERMINAL: JobStatus[] = ['completed', 'failed', 'cancelled'];

const JOB_TONE: Record<JobStatus, string> = {
  queued: 'bg-slate-100 text-slate-600',
  discovering: 'bg-sky-100 text-sky-700',
  analyzing: 'bg-violet-100 text-violet-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const TASK_TONE: Record<TaskStatus, string> = {
  pending: 'bg-slate-100 text-slate-500',
  running: 'bg-sky-100 text-sky-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  skipped: 'bg-slate-100 text-slate-400',
};

const ICP_TONE: Record<IcpMatch, string> = {
  match: 'bg-emerald-100 text-emerald-700',
  unknown: 'bg-amber-100 text-amber-700',
  no_match: 'bg-red-100 text-red-700',
};

const ICP_VERDICTS: IcpMatch[] = ['match', 'unknown', 'no_match'];

/** The stored map is untyped JSON, so every verdict is checked rather than asserted. */
function icpRows(raw: Record<string, string> | null | undefined): { key: string; verdict: IcpMatch }[] {
  if (!raw) return [];
  return Object.entries(raw)
    .filter((entry): entry is [string, IcpMatch] => ICP_VERDICTS.includes(entry[1] as IcpMatch))
    .map(([key, verdict]) => ({ key, verdict }));
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : 'Request failed';
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function splitList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function scoreTone(score: number | null | undefined) {
  if (score === null || score === undefined) return 'text-slate-400';
  if (score >= 70) return 'text-emerald-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-slate-700';
}

export default function LeadIntelligencePage() {
  const [tab, setTab] = useState<'discover' | 'jobs' | 'candidates'>('discover');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [minScore, setMinScore] = useState('');

  // form
  const [name, setName] = useState('');
  const [request, setRequest] = useState('');
  const [depth, setDepth] = useState<'light' | 'standard' | 'deep'>('standard');
  const [limit, setLimit] = useState('20');
  const [industries, setIndustries] = useState('');
  const [geography, setGeography] = useState('');
  const [technologies, setTechnologies] = useState('');
  const [sizeMin, setSizeMin] = useState('');
  const [sizeMax, setSizeMax] = useState('');
  const [seeds, setSeeds] = useState('');
  const [plan, setPlan] = useState<{ specification: Record<string, unknown> } | null>(null);

  const loadJobs = useCallback(async () => {
    const res = await api<{ jobs: Job[] }>('/api/v1/lead-intelligence/jobs');
    setJobs(res.jobs || []);
    return res.jobs || [];
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await loadJobs();
      } catch (err) {
        setError(errMsg(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [loadJobs]);

  // Poll only while the selected job can still change.
  useEffect(() => {
    if (!selectedJob || TERMINAL.includes(selectedJob.status)) return;
    const id = selectedJob.id;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const [detailRes, list] = await Promise.all([
            api<{ job: Job }>(`/api/v1/lead-intelligence/jobs/${id}`),
            loadJobs(),
          ]);
          setSelectedJob(detailRes.job);
          setJobs(list);
        } catch {
          // a transient poll failure must not blank the screen; the next tick retries
        }
      })();
    }, 3000);
    return () => clearInterval(timer);
  }, [selectedJob, loadJobs]);

  const loadCandidates = useCallback(
    async (jobId: string, status: string, score: string) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (score) params.set('minScore', score);
      const qs = params.toString();
      const res = await api<{ candidates: Candidate[] }>(
        `/api/v1/lead-intelligence/jobs/${jobId}/candidates${qs ? `?${qs}` : ''}`,
      );
      setCandidates(res.candidates || []);
    },
    [],
  );

  useEffect(() => {
    if (!selectedJob) {
      setCandidates([]);
      return;
    }
    void loadCandidates(selectedJob.id, statusFilter, minScore).catch((err) => setError(errMsg(err)));
  }, [selectedJob, statusFilter, minScore, loadCandidates]);

  async function openJob(job: Job) {
    setTab('jobs');
    setDetail(null);
    setDetailId(null);
    try {
      const res = await api<{ job: Job }>(`/api/v1/lead-intelligence/jobs/${job.id}`);
      setSelectedJob(res.job);
    } catch (err) {
      setFlash({ ok: false, text: errMsg(err) });
    }
  }

  async function previewPlan(e: FormEvent) {
    e.preventDefault();
    if (!request.trim()) return;
    setBusy(true);
    setPlan(null);
    try {
      const res = await api<{ status: string; specification?: Record<string, unknown>; message?: string }>(
        '/api/v1/lead-intelligence/jobs/plan',
        { method: 'POST', body: { request: request.trim() } },
      );
      if (res.status === 'success' && res.specification) {
        setPlan({ specification: res.specification });
      } else {
        setFlash({ ok: false, text: res.message || 'Could not build a plan from that request.' });
      }
    } catch (err) {
      setFlash({ ok: false, text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function startJob(e: FormEvent) {
    e.preventDefault();
    const cap = Number(limit);
    if (!Number.isFinite(cap) || cap < 1) {
      setFlash({ ok: false, text: 'Limit must be a number of 1 or more.' });
      return;
    }

    const spec: Record<string, unknown> = { limit: cap };
    if (industries.trim()) spec.industries = splitList(industries);
    if (geography.trim()) spec.geography = splitList(geography);
    if (technologies.trim()) spec.technologies = splitList(technologies);
    if (sizeMin || sizeMax) {
      spec.companySize = {
        ...(sizeMin ? { min: Number(sizeMin) } : {}),
        ...(sizeMax ? { max: Number(sizeMax) } : {}),
      };
    }
    if (seeds.trim()) spec.seedDomains = splitList(seeds);

    // Seeds are trusted domains, so they travel as seedUrls and get normalized server side.
    const seedUrls = seeds.trim()
      ? splitList(seeds).map((d) => (d.includes('://') ? d : `https://${d}`))
      : undefined;

    setBusy(true);
    setFlash(null);
    try {
      const res = await api<{ job: Job }>('/api/v1/lead-intelligence/jobs', {
        method: 'POST',
        body: {
          name: name.trim() || undefined,
          request: spec.industries ? undefined : request.trim() || undefined,
          spec,
          depth,
          seedUrls,
        },
      });
      await loadJobs();
      setPlan(null);
      setName('');
      await openJob(res.job);
      setFlash({ ok: true, text: 'Research job queued.' });
    } catch (err) {
      setFlash({ ok: false, text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function cancelJob() {
    if (!selectedJob) return;
    setBusy(true);
    try {
      await api(`/api/v1/lead-intelligence/jobs/${selectedJob.id}/cancel`, { method: 'POST' });
      const res = await api<{ job: Job }>(`/api/v1/lead-intelligence/jobs/${selectedJob.id}`);
      setSelectedJob(res.job);
      await loadJobs();
      setFlash({ ok: true, text: 'Job cancelled.' });
    } catch (err) {
      setFlash({ ok: false, text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  async function openCandidate(id: string) {
    setDetailId(id);
    try {
      const res = await api<{ candidate: CandidateDetail }>(
        `/api/v1/lead-intelligence/candidates/${id}`,
      );
      setDetail(res.candidate);
    } catch (err) {
      setFlash({ ok: false, text: errMsg(err) });
      setDetail(null);
    }
  }

  async function promote(id: string) {
    setBusy(true);
    try {
      const res = await api<{ leadId: string; alreadyPromoted: boolean }>(
        `/api/v1/lead-intelligence/candidates/${id}/promote`,
        { method: 'POST' },
      );
      setFlash({
        ok: true,
        text: res.alreadyPromoted
          ? 'Already in the CRM — opened the existing lead.'
          : 'Promoted. It is now in the sales pipeline.',
      });
      await openCandidate(id);
    } catch (err) {
      setFlash({ ok: false, text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div role="status" className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Loading lead intelligence…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="mx-auto max-w-md rounded-xl border border-red-200 bg-white p-6">
        <p className="text-sm text-slate-700">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const activeJobs = jobs.filter((j) => !TERMINAL.includes(j.status));
  const totalCandidates = jobs.reduce((n, j) => n + (j.stats?.candidatesFound ?? 0), 0);
  const totalQualified = jobs.reduce((n, j) => n + (j.progress?.qualified ?? 0), 0);
  const icp = icpRows(detail?.icpMatch);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Lead Intelligence</h1>
          <p className="text-sm text-slate-500">
            Discover companies against your ICP, then judge every claim against its source.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadJobs().catch((e) => setFlash({ ok: false, text: errMsg(e) }))}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-white"
        >
          Refresh
        </button>
      </div>

      {flash && (
        <p
          role={flash.ok ? 'status' : 'alert'}
          className={`rounded-lg border px-3 py-2 text-sm ${
            flash.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {flash.text}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Active jobs</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{activeJobs.length}</p>
          <p className="mt-1 text-xs text-slate-500">
            Source: research_jobs · {jobs.length === 0 ? 'No jobs yet' : `${jobs.length} total`}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Qualified leads</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{totalQualified}</p>
          <p className="mt-1 text-xs text-slate-500">
            Source: research_jobs.progress · score 70 or above
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Candidates found</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totalCandidates}</p>
          <p className="mt-1 text-xs text-slate-500">Source: lead_candidates · deduplicated by domain</p>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Lead intelligence sections"
        className="flex w-fit gap-1 rounded-lg bg-slate-100 p-1"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          const order = ['discover', 'jobs', 'candidates'] as const;
          const i = order.indexOf(tab);
          const next = order[(i + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length];
          setTab(next);
          document.getElementById(`li-tab-${next}`)?.focus();
        }}
      >
        {(['discover', 'jobs', 'candidates'] as const).map((t) => (
          <button
            key={t}
            id={`li-tab-${t}`}
            type="button"
            role="tab"
            aria-selected={tab === t}
            aria-controls={`li-panel-${t}`}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize ${
              tab === t ? 'bg-white text-slate-900 shadow' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'discover' && (
        <div
          role="tabpanel"
          id="li-panel-discover"
          aria-labelledby="li-tab-discover"
          tabIndex={0}
          className="space-y-4"
        >
          <form
            onSubmit={startJob}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
          >
            <div>
              <label htmlFor="li-name" className="block text-xs font-medium text-slate-600">
                Job name
              </label>
              <input
                id="li-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Q3 European logistics accounts"
              />
            </div>

            <div>
              <label htmlFor="li-request" className="block text-xs font-medium text-slate-600">
                What are you looking for?
              </label>
              <textarea
                id="li-request"
                rows={3}
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Regional 3PL providers in Germany and the Netherlands with 200-800 staff"
              />
              <p className="mt-1 text-xs text-slate-500">
                Used to build the search plan. The criteria below override it when set.
              </p>
            </div>

            <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <legend className="sr-only">Targeting criteria</legend>
              {(
                [
                  ['li-industries', 'Industries', industries, setIndustries, 'logistics, freight'],
                  ['li-geo', 'Geography', geography, setGeography, 'Germany, Netherlands'],
                  ['li-tech', 'Technologies', technologies, setTechnologies, 'SAP, Oracle TMS'],
                  ['li-seeds', 'Seed domains', seeds, setSeeds, 'acme-logistics.com'],
                ] as const
              ).map(([id, label, value, setter, placeholder]) => (
                <div key={id}>
                  <label htmlFor={id} className="block text-xs font-medium text-slate-600">
                    {label}
                  </label>
                  <input
                    id={id}
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    placeholder={placeholder}
                  />
                  <p className="mt-0.5 text-[11px] text-slate-400">Comma separated</p>
                </div>
              ))}
            </fieldset>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label htmlFor="li-size-min" className="block text-xs font-medium text-slate-600">
                  Min employees
                </label>
                <input
                  id="li-size-min"
                  type="number"
                  min={1}
                  value={sizeMin}
                  onChange={(e) => setSizeMin(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="li-size-max" className="block text-xs font-medium text-slate-600">
                  Max employees
                </label>
                <input
                  id="li-size-max"
                  type="number"
                  min={1}
                  value={sizeMax}
                  onChange={(e) => setSizeMax(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="li-limit" className="block text-xs font-medium text-slate-600">
                  Max companies
                </label>
                <input
                  id="li-limit"
                  type="number"
                  min={1}
                  required
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="li-depth" className="block text-xs font-medium text-slate-600">
                  Depth
                </label>
                <select
                  id="li-depth"
                  value={depth}
                  onChange={(e) => setDepth(e.target.value as typeof depth)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="light">Light (25)</option>
                  <option value="standard">Standard (100)</option>
                  <option value="deep">Deep</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !request.trim()}
                onClick={previewPlan}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy ? 'Working…' : 'Preview plan'}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy ? 'Starting…' : 'Start research'}
              </button>
            </div>
          </form>

          {plan && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-slate-800">Planned criteria</h2>
              <p className="mt-1 text-xs text-slate-500">
                Source: discovery planner · this is what the job will search for
              </p>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {Object.entries(plan.specification)
                  .filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))
                  .map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-sm">
                      <dt className="w-36 shrink-0 text-slate-500">{key}</dt>
                      <dd className="min-w-0 break-words text-slate-800">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          )}
        </div>
      )}

      {tab === 'jobs' && (
        <div
          role="tabpanel"
          id="li-panel-jobs"
          aria-labelledby="li-tab-jobs"
          tabIndex={0}
          className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        >
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-800">Jobs</h2>
            {jobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <p className="text-sm font-medium text-slate-600">No research jobs yet</p>
                <p className="mt-1 text-sm text-slate-500">
                  Describe who you are looking for on the Discover tab to start one.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <button
                      type="button"
                      onClick={() => void openJob(j)}
                      aria-pressed={selectedJob?.id === j.id}
                      className={`w-full rounded-xl border p-4 text-left ${
                        selectedJob?.id === j.id
                          ? 'border-indigo-300 bg-indigo-50/40'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${JOB_TONE[j.status]}`}
                        >
                          {j.status}
                        </span>
                        <span className="text-xs text-slate-500">
                          {j.depth} · {relTime(j.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-900">{j.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {j.progress?.processed ?? 0}/{j.progress?.total ?? '—'} processed ·{' '}
                        {j.stats?.candidatesFound ?? 0} candidates · {j.stats?.aiCalls ?? 0} AI calls
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            {!selectedJob ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <p className="text-sm font-medium text-slate-600">No job selected</p>
                <p className="mt-1 text-sm text-slate-500">
                  Pick a job to watch its stages and read its results.
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">{selectedJob.name}</h2>
                      <p className="text-xs text-slate-500">
                        Source: research_jobs · updated {relTime(selectedJob.updatedAt)}
                      </p>
                    </div>
                    {!TERMINAL.includes(selectedJob.status) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void cancelJob()}
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        {busy ? 'Cancelling…' : 'Cancel job'}
                      </button>
                    )}
                  </div>

                  {selectedJob.error && (
                    <p
                      role="alert"
                      className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                    >
                      {selectedJob.error}
                    </p>
                  )}

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Progress</span>
                      <span>
                        {selectedJob.progress?.processed ?? 0} of{' '}
                        {selectedJob.progress?.total ?? selectedJob.progress?.discovered ?? 0}
                      </span>
                    </div>
                    <div
                      className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={selectedJob.progress?.total ?? 0}
                      aria-valuenow={selectedJob.progress?.processed ?? 0}
                      aria-label="Job progress"
                    >
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            ((selectedJob.progress?.processed ?? 0) /
                              Math.max(1, selectedJob.progress?.total ?? selectedJob.progress?.discovered ?? 0)) *
                              100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    {(
                      [
                        ['Pages crawled', selectedJob.stats?.pagesCrawled],
                        ['Candidates', selectedJob.stats?.candidatesFound],
                        ['AI calls', selectedJob.stats?.aiCalls],
                        ['Errors', selectedJob.stats?.errors],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-slate-50 px-2 py-1.5">
                        <dt className="text-slate-500">{label}</dt>
                        <dd className="text-sm font-semibold text-slate-900">{value ?? 0}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-800">Stages</h3>
                  <p className="mt-0.5 text-xs text-slate-500">Source: research_tasks</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {(selectedJob.tasks ?? []).map((t) => (
                      <li
                        key={t.id}
                        title={t.error ?? undefined}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TASK_TONE[t.status]}`}
                      >
                        {t.type.replace(/_/g, ' ')}
                      </li>
                    ))}
                  </ul>
                  {(selectedJob.tasks ?? []).length === 0 && (
                    <p className="mt-2 text-xs text-slate-500">No stage data for this job.</p>
                  )}
                </div>

                {selectedJob.status === 'completed' && (
                  <button
                    type="button"
                    onClick={() => setTab('candidates')}
                    className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    Review {selectedJob.stats?.candidatesFound ?? 0} candidates
                  </button>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {tab === 'candidates' && (
        <div
          role="tabpanel"
          id="li-panel-candidates"
          aria-labelledby="li-tab-candidates"
          tabIndex={0}
          className="space-y-3"
        >
          {!selectedJob ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <p className="text-sm font-medium text-slate-600">No job selected</p>
              <p className="mt-1 text-sm text-slate-500">Pick a job on the Jobs tab first.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="mr-auto text-sm font-semibold text-slate-800">
                  Candidates from “{selectedJob.name}” ({candidates.length})
                </h2>
                <label htmlFor="li-status-filter" className="sr-only">
                  Filter by status
                </label>
                <select
                  id="li-status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                >
                  <option value="">All statuses</option>
                  <option value="qualified">Qualified</option>
                  <option value="review_required">Needs review</option>
                  <option value="discovered">Discovered</option>
                </select>
                <label htmlFor="li-min-score" className="sr-only">
                  Minimum score
                </label>
                <input
                  id="li-min-score"
                  type="number"
                  min={0}
                  max={100}
                  value={minScore}
                  onChange={(e) => setMinScore(e.target.value)}
                  placeholder="Min score"
                  className="w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                />
              </div>

              {candidates.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                  <p className="text-sm font-medium text-slate-600">No candidates match</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Candidates appear once the crawl and AI stages finish. Widen the filters if the
                    job has already completed.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {candidates.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => void openCandidate(c.id)}
                        aria-pressed={detailId === c.id}
                        className={`w-full rounded-xl border p-4 text-left ${
                          detailId === c.id
                            ? 'border-indigo-300 bg-indigo-50/40'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              c.status === 'qualified'
                                ? 'bg-emerald-100 text-emerald-700'
                                : c.status === 'review_required'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {c.status.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs text-slate-500">
                            {c.industry || 'industry unknown'}
                            {c.country ? ` · ${c.country}` : ''}
                          </span>
                          <span
                            className={`ml-auto text-lg font-semibold ${scoreTone(c.score)}`}
                            aria-label={`ICP score ${c.score ?? 'not scored'}`}
                          >
                            {c.score ?? '—'}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-slate-900">{c.companyName}</p>
                        {c.normalizedDomain && (
                          <p className="text-xs text-slate-500">{c.normalizedDomain}</p>
                        )}
                        {c.summary && (
                          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{c.summary}</p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {detail && (
                <section className="rounded-xl border border-indigo-200 bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">{detail.companyName}</h3>
                      {detail.website ? (
                        <a
                          href={detail.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-indigo-600 hover:text-indigo-700"
                        >
                          {detail.website} ↗
                        </a>
                      ) : (
                        <p className="text-xs text-slate-500">{detail.normalizedDomain}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {detail.status === 'imported' ? (
                        <a
                          href="/sales"
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                        >
                          In CRM →
                        </a>
                      ) : (
                        <button
                          type="button"
                          disabled={busy || detail.score === null || detail.score === undefined}
                          onClick={() => void promote(detail.id)}
                          title={
                            detail.score === null || detail.score === undefined
                              ? 'Analysis has not scored this candidate yet'
                              : 'Create a lead in the sales pipeline'
                          }
                          className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          {busy ? 'Working…' : 'Promote to lead'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setDetail(null);
                          setDetailId(null);
                        }}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Close
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className={`text-3xl font-semibold ${scoreTone(detail.score)}`}>
                      {detail.score ?? '—'}
                    </span>
                    <span className="text-xs text-slate-500">ICP fit score, 0-100</span>
                  </div>

                  {icp.length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-xs font-medium text-slate-600">ICP match</h4>
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {icp.map(({ key, verdict }) => (
                          <li
                            key={key}
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ICP_TONE[verdict]}`}
                          >
                            {key}: {verdict.replace(/_/g, ' ')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {detail.summary && (
                    <div className="mt-3">
                      <h4 className="text-xs font-medium text-slate-600">Summary</h4>
                      <p className="mt-1 text-sm text-slate-700">{detail.summary}</p>
                    </div>
                  )}

                  {detail.scoreReasons && detail.scoreReasons.length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-xs font-medium text-slate-600">Why this score</h4>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
                        {detail.scoreReasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {detail.signals.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-xs font-medium text-slate-600">
                        Signals ({detail.signals.length})
                      </h4>
                      <ul className="mt-1 space-y-1.5">
                        {detail.signals.map((s) => (
                          <li key={s.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-700">
                                {s.type.replace(/_/g, ' ')}
                              </span>
                              <span className="font-medium text-slate-800">{s.title}</span>
                              {s.confidence !== null && s.confidence !== undefined && (
                                <span className="text-[11px] text-slate-500">
                                  {s.confidence}% confidence
                                </span>
                              )}
                            </div>
                            {s.description && (
                              <p className="mt-0.5 text-xs text-slate-600">{s.description}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-4">
                    <h4 className="text-xs font-medium text-slate-600">
                      Evidence ({detail.evidence.length})
                    </h4>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Every claim above traces back to a crawled page.
                    </p>
                    {detail.evidence.length === 0 ? (
                      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        No evidence recorded. This candidate has not been through the AI stage, or its
                        pages could not be extracted. Treat the score as unverified.
                      </p>
                    ) : (
                      <ul className="mt-1 space-y-1.5">
                        {detail.evidence.map((e) => (
                          <li key={e.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                            <p className="font-medium text-slate-800">{e.claim}</p>
                            {e.snippet && (
                              <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{e.snippet}</p>
                            )}
                            <a
                              href={e.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-block truncate text-[11px] text-indigo-600 hover:text-indigo-700"
                            >
                              {e.sourceUrl} ↗
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
