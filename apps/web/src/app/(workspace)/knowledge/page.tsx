'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

type Source = {
  id: string;
  title: string;
  type: string;
  url: string | null;
  mimeType: string | null;
  fileSize: number | null;
  status: string;
  visibility?: string;
  chunkCount: number | null;
  metadata?: { error?: string; kind?: string } | null;
  createdAt: string;
  updatedAt?: string;
};

type SearchHit = {
  id: string;
  content: string;
  sourceId: string;
  sourceTitle: string;
  score: number;
};

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Queued', cls: 'bg-amber-100 text-amber-800' },
  processing: { label: 'Processing', cls: 'bg-indigo-100 text-indigo-700' },
  ready: { label: 'Ready', cls: 'bg-emerald-100 text-emerald-800' },
  error: { label: 'Error', cls: 'bg-rose-100 text-rose-700' },
};

function formatBytes(n: number | null): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const KIND_OPTIONS = [
  { value: 'document', label: 'Document' },
  { value: 'sop', label: 'SOP' },
  { value: 'reference', label: 'Reference' },
] as const;

function kindOf(s: Source): string {
  return typeof s.metadata?.kind === 'string' ? s.metadata.kind : 'document';
}

export default function KnowledgePage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const [detail, setDetail] = useState<Source | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Upload / URL intake
  const [file, setFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [fileKind, setFileKind] = useState('document');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [url, setUrl] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [urlKind, setUrlKind] = useState('document');
  const [addingUrl, setAddingUrl] = useState(false);
  const [urlMsg, setUrlMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Search
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Per-row busy
  const [busyId, setBusyId] = useState('');
  const [rowMsg, setRowMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api<{ sources: Source[] }>('/api/v1/knowledge');
      setSources(res.sources || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sources');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while anything is pending/processing
  const inflight = sources.some((s) => s.status === 'pending' || s.status === 'processing');
  useEffect(() => {
    if (!inflight) return;
    const t = setInterval(() => {
      void api<{ sources: Source[] }>('/api/v1/knowledge')
        .then((res) => setSources(res.sources || []))
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(t);
  }, [inflight]);

  async function uploadFile(e: React.FormEvent) {
    e.preventDefault();
    setUploadMsg(null);
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (fileTitle.trim()) fd.append('title', fileTitle.trim());
      fd.append('kind', fileKind);
      const res = await api<{ source: Source }>('/api/v1/knowledge/upload', {
        method: 'POST',
        body: fd,
      });
      setUploadMsg({ ok: true, text: `“${res.source.title}” queued for processing.` });
      setFile(null);
      setFileTitle('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load();
    } catch (err) {
      setUploadMsg({ ok: false, text: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      setUploading(false);
    }
  }

  async function addUrl(e: React.FormEvent) {
    e.preventDefault();
    setUrlMsg(null);
    setAddingUrl(true);
    try {
      const res = await api<{ source: Source }>('/api/v1/knowledge/url', {
        method: 'POST',
        body: { url, title: urlTitle.trim() || undefined, kind: urlKind },
      });
      setUrlMsg({ ok: true, text: `“${res.source.title}” queued for processing.` });
      setUrl('');
      setUrlTitle('');
      await load();
    } catch (err) {
      setUrlMsg({ ok: false, text: err instanceof Error ? err.message : 'Failed to add URL' });
    } finally {
      setAddingUrl(false);
    }
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchError('');
    setSearching(true);
    try {
      const res = await api<{ results: SearchHit[] }>('/api/v1/knowledge/search', {
        method: 'POST',
        body: { query, limit: 10 },
      });
      setHits(res.results || []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      setHits(null);
    } finally {
      setSearching(false);
    }
  }

  async function removeSource(s: Source) {
    if (!window.confirm(`Delete “${s.title}”? This cannot be undone.`)) return;
    setBusyId(s.id);
    setRowMsg(null);
    try {
      await api(`/api/v1/knowledge/${s.id}`, { method: 'DELETE' });
      setRowMsg({ id: s.id, ok: true, text: 'Deleted.' });
      await load();
    } catch (err) {
      setRowMsg({
        id: s.id,
        ok: false,
        text: err instanceof Error ? err.message : 'Delete failed',
      });
    } finally {
      setBusyId('');
    }
  }

  async function downloadSource(s: Source) {
    setBusyId(s.id);
    setRowMsg(null);
    try {
      const res = await api<{ url: string }>(`/api/v1/knowledge/${s.id}/download`);
      window.open(res.url, '_blank', 'noopener');
    } catch (err) {
      setRowMsg({
        id: s.id,
        ok: false,
        text: err instanceof Error ? err.message : 'Download failed',
      });
    } finally {
      setBusyId('');
    }
  }

  async function toggleDetails(s: Source) {
    if (expandedId === s.id) {
      setExpandedId('');
      setDetail(null);
      return;
    }
    setExpandedId(s.id);
    setDetail(s);
    setDetailLoading(true);
    try {
      const res = await api<{ source: Source }>(`/api/v1/knowledge/${s.id}`);
      setDetail(res.source);
    } catch {
      setDetail(s);
    } finally {
      setDetailLoading(false);
    }
  }

  const visible = sources.filter((s) => {
    if (filter && !s.title.toLowerCase().includes(filter.toLowerCase())) return false;
    if (kindFilter && kindOf(s) !== kindFilter) return false;
    return true;
  });

  if (loading) {
    return <p className="text-sm text-slate-500">Loading knowledge sources…</p>;
  }

  if (error) {
    return (
      <div className="max-w-xl rounded-xl border border-rose-200 bg-rose-50 p-4">
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 cursor-pointer rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-rose-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Knowledge Hub</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload documents or add URLs. Sources are processed in the background and become
          searchable when ready.
        </p>
      </div>

      {/* Intake */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section
          className="rounded-xl border border-slate-200 bg-white p-5"
          aria-labelledby="upload-heading"
        >
          <h2 id="upload-heading" className="text-sm font-semibold text-slate-900">
            Upload a document
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            PDF, DOCX, TXT, or Markdown · up to 50&nbsp;MB
          </p>
          <form onSubmit={(e) => void uploadFile(e)} className="mt-4 space-y-3">
            <div>
              <label htmlFor="kfile" className="block text-xs font-medium text-slate-700">
                File
              </label>
              <input
                id="kfile"
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
                className="mt-1 block w-full cursor-pointer rounded-lg border border-slate-300 bg-white text-sm text-slate-700 file:mr-3 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="ktitle" className="block text-xs font-medium text-slate-700">
                  Title (optional)
                </label>
                <input
                  id="ktitle"
                  type="text"
                  value={fileTitle}
                  onChange={(e) => setFileTitle(e.target.value)}
                  placeholder={file?.name || 'Document title'}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="kkind" className="block text-xs font-medium text-slate-700">
                  Kind
                </label>
                <select
                  id="kkind"
                  value={fileKind}
                  onChange={(e) => setFileKind(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {KIND_OPTIONS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {uploadMsg && (
              <p
                className={`text-sm ${uploadMsg.ok ? 'text-emerald-700' : 'text-rose-600'}`}
                role={uploadMsg.ok ? 'status' : 'alert'}
              >
                {uploadMsg.text}
              </p>
            )}
            <button
              type="submit"
              disabled={uploading || !file}
              className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </form>
        </section>

        <section
          className="rounded-xl border border-slate-200 bg-white p-5"
          aria-labelledby="url-heading"
        >
          <h2 id="url-heading" className="text-sm font-semibold text-slate-900">
            Add a URL
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Public http(s) pages · content is fetched by the worker
          </p>
          <form onSubmit={(e) => void addUrl(e)} className="mt-4 space-y-3">
            <div>
              <label htmlFor="kurl" className="block text-xs font-medium text-slate-700">
                URL
              </label>
              <input
                id="kurl"
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/docs"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="kurltitle" className="block text-xs font-medium text-slate-700">
                  Title (optional)
                </label>
                <input
                  id="kurltitle"
                  type="text"
                  value={urlTitle}
                  onChange={(e) => setUrlTitle(e.target.value)}
                  placeholder="Page title"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="kurlkind" className="block text-xs font-medium text-slate-700">
                  Kind
                </label>
                <select
                  id="kurlkind"
                  value={urlKind}
                  onChange={(e) => setUrlKind(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {KIND_OPTIONS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {urlMsg && (
              <p
                className={`text-sm ${urlMsg.ok ? 'text-emerald-700' : 'text-rose-600'}`}
                role={urlMsg.ok ? 'status' : 'alert'}
              >
                {urlMsg.text}
              </p>
            )}
            <button
              type="submit"
              disabled={addingUrl || !url}
              className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addingUrl ? 'Adding…' : 'Add URL'}
            </button>
          </form>
        </section>
      </div>

      {/* Search */}
      <section
        className="rounded-xl border border-slate-200 bg-white p-5"
        aria-labelledby="search-heading"
      >
        <h2 id="search-heading" className="text-sm font-semibold text-slate-900">
          Search knowledge
        </h2>
        <form onSubmit={(e) => void runSearch(e)} className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="kq" className="sr-only">
            Search query
          </label>
          <input
            id="kq"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            required
            placeholder="Search ready sources…"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>
        {searchError && (
          <p className="mt-3 text-sm text-rose-600" role="alert">
            {searchError}
          </p>
        )}
        {hits !== null && !searchError && (
          <ul className="mt-4 space-y-3">
            {hits.length === 0 ? (
              <li className="text-sm text-slate-500">
                No matches. Wait for sources to finish processing, or try different words.
              </li>
            ) : (
              hits.map((h) => (
                <li key={h.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs font-medium text-indigo-700">{h.sourceTitle}</p>
                  <p className="mt-1 text-sm text-slate-700">{h.content}</p>
                </li>
              ))
            )}
          </ul>
        )}
      </section>

      {/* Source list */}
      <section aria-labelledby="sources-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="sources-heading" className="text-sm font-semibold text-slate-900">
            Sources
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="kkindfilter" className="sr-only">
              Filter by kind
            </label>
            <select
              id="kkindfilter"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">All kinds</option>
              {KIND_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <label htmlFor="kfilter" className="sr-only">
              Filter by title
            </label>
            <input
              id="kfilter"
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
              className="w-40 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => void load()}
              className="cursor-pointer rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors duration-200 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <h3 className="text-sm font-semibold text-slate-800">
              {sources.length === 0 ? 'Add your first source' : 'No sources match your filter'}
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              {sources.length === 0
                ? 'Upload a PDF, DOCX, TXT, or Markdown file — or add a public URL — to build your company knowledge base.'
                : 'Clear the filter to see all sources.'}
            </p>
            {sources.length === 0 && (
              <button
                type="button"
                onClick={() => document.getElementById('kfile')?.focus()}
                className="mt-4 cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-indigo-700"
              >
                Upload a document
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map((s) => {
              const badge = STATUS_BADGES[s.status] ?? {
                label: s.status,
                cls: 'bg-slate-100 text-slate-600',
              };
              const errText = s.status === 'error' ? s.metadata?.error : undefined;
              return (
                <li
                  key={s.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">{s.title}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                        {s.type}
                      </span>
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-indigo-700">
                        {kindOf(s) === 'sop' ? 'SOP' : kindOf(s)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {s.status === 'ready' && s.chunkCount != null
                        ? `${s.chunkCount} chunks · `
                        : ''}
                      {s.mimeType ? `${formatBytes(s.fileSize)} · ` : ''}
                      Added {new Date(s.createdAt).toLocaleString()}
                    </p>
                    {s.url && (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-block max-w-full truncate text-xs text-indigo-600 underline hover:text-indigo-800"
                      >
                        {s.url}
                      </a>
                    )}
                    {errText && (
                      <p className="mt-1 text-xs text-rose-600" role="alert">
                        {errText}
                      </p>
                    )}
                    {rowMsg && rowMsg.id === s.id && (
                      <p
                        className={`mt-1 text-xs ${rowMsg.ok ? 'text-emerald-700' : 'text-rose-600'}`}
                        role={rowMsg.ok ? 'status' : 'alert'}
                      >
                        {rowMsg.text}
                      </p>
                    )}
                    {expandedId === s.id && (
                      <div
                        id={`source-detail-${s.id}`}
                        className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"
                        data-testid="source-detail"
                      >
                        {detailLoading ? (
                          <p className="text-slate-500">Loading details…</p>
                        ) : (
                          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                            <div>
                              <dt className="font-medium text-slate-600">ID</dt>
                              <dd className="font-mono break-all">{detail?.id ?? s.id}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-slate-600">Kind</dt>
                              <dd>{kindOf(detail ?? s)}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-slate-600">Visibility</dt>
                              <dd>{detail?.visibility ?? '—'}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-slate-600">MIME</dt>
                              <dd>{detail?.mimeType ?? '—'}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-slate-600">Size</dt>
                              <dd>
                                {detail?.fileSize != null ? formatBytes(detail.fileSize) : '—'}
                              </dd>
                            </div>
                            <div>
                              <dt className="font-medium text-slate-600">Chunks</dt>
                              <dd>{detail?.chunkCount ?? 0}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-slate-600">Status</dt>
                              <dd>{detail?.status ?? s.status}</dd>
                            </div>
                            <div>
                              <dt className="font-medium text-slate-600">Created</dt>
                              <dd>{new Date(detail?.createdAt ?? s.createdAt).toLocaleString()}</dd>
                            </div>
                            {detail?.url && (
                              <div className="sm:col-span-2">
                                <dt className="font-medium text-slate-600">URL</dt>
                                <dd className="break-all">{detail.url}</dd>
                              </div>
                            )}
                            {detail?.metadata?.error && (
                              <div className="sm:col-span-2">
                                <dt className="font-medium text-slate-600">Error</dt>
                                <dd className="text-rose-600">{detail.metadata.error}</dd>
                              </div>
                            )}
                          </dl>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      aria-expanded={expandedId === s.id}
                      aria-controls={`source-detail-${s.id}`}
                      onClick={() => void toggleDetails(s)}
                      className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50"
                    >
                      {expandedId === s.id ? 'Hide details' : 'Details'}
                    </button>
                    {s.type === 'file' && (
                      <button
                        type="button"
                        disabled={busyId === s.id || s.status !== 'ready'}
                        onClick={() => void downloadSource(s)}
                        className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Download
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => void removeSource(s)}
                      className="cursor-pointer rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors duration-200 hover:bg-rose-50 disabled:opacity-50"
                    >
                      {busyId === s.id ? 'Working…' : 'Delete'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
