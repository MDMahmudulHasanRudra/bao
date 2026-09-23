'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

type Conversation = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

type Citation = {
  sourceId?: string;
  chunkId?: string;
  title?: string;
  content?: string;
  score?: number;
};

type Message = {
  id: string;
  role: string;
  content: string;
  citations?: Citation[] | null;
  runMetadata?: {
    provider?: string;
    model?: string;
    status?: string;
    errorCategory?: string;
    chunksUsed?: number;
  } | null;
  createdAt: string;
};

export default function AssistantPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [activeId, setActiveId] = useState('');

  const [messages, setMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState('');

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const res = await api<{ conversations: Conversation[] }>(
        '/api/v1/ai-assistant/conversations',
      );
      setConversations(res.conversations || []);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadThread = useCallback(async (id: string) => {
    if (!id) {
      setMessages([]);
      setThreadError('');
      return;
    }
    setThreadLoading(true);
    setThreadError('');
    try {
      const res = await api<{ messages: Message[] }>(`/api/v1/ai-assistant/conversations/${id}`);
      setMessages(res.messages || []);
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadThread(activeId);
  }, [activeId, loadThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function startConversation() {
    setListError('');
    setSendError('');
    try {
      const res = await api<{ conversation: Conversation }>('/api/v1/ai-assistant/conversations', {
        method: 'POST',
        body: {},
      });
      setConversations((prev) => [res.conversation, ...prev]);
      setActiveId(res.conversation.id);
      setMessages([]);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not start a conversation');
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!activeId || !draft.trim() || sending) return;
    setSendError('');
    setSending(true);
    const text = draft.trim();
    const optimisticId = `optimistic-${Date.now()}`;
    setDraft('');
    setMessages((prev) => [
      ...prev,
      { id: optimisticId, role: 'user', content: text, createdAt: new Date().toISOString() },
    ]);
    try {
      const res = await api<{ assistantMessage: Message }>(
        `/api/v1/ai-assistant/conversations/${activeId}/messages`,
        { method: 'POST', body: { content: text } },
      );
      setMessages((prev) => [...prev.filter((m) => m.id !== optimisticId), res.assistantMessage]);
      void api<{ conversations: Conversation[] }>('/api/v1/ai-assistant/conversations')
        .then((data) => setConversations(data.conversations || []))
        .catch(() => undefined);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Message failed to send');
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
    } finally {
      setSending(false);
    }
  }

  if (listLoading) {
    return <p className="text-sm text-slate-500">Loading AI Assistant…</p>;
  }

  if (listError && conversations.length === 0) {
    return (
      <div className="max-w-xl rounded-xl border border-rose-200 bg-rose-50 p-4">
        <p className="text-sm text-rose-700" role="alert">
          {listError}
        </p>
        <button
          type="button"
          onClick={() => void loadList()}
          className="mt-3 cursor-pointer rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition-colors duration-200 hover:bg-rose-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const active = conversations.find((c) => c.id === activeId);

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-5xl flex-col gap-4 md:flex-row">
      {/* Conversation list */}
      <aside className="flex w-full shrink-0 flex-col rounded-xl border border-slate-200 bg-white md:w-64">
        <div className="border-b border-slate-100 p-3">
          <button
            type="button"
            onClick={() => void startConversation()}
            className="w-full cursor-pointer rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-indigo-700"
          >
            New conversation
          </button>
          {listError && (
            <p className="mt-2 text-xs text-rose-600" role="alert">
              {listError}
            </p>
          )}
        </div>
        <ul className="flex-1 overflow-auto p-2">
          {conversations.length === 0 ? (
            <li className="px-2 py-4 text-center text-xs text-slate-500">No conversations yet.</li>
          ) : (
            conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className={`mb-1 w-full cursor-pointer truncate rounded-lg px-3 py-2 text-left text-sm transition-colors duration-200 ${
                    c.id === activeId
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {c.title || 'New conversation'}
                </button>
              </li>
            ))
          )}
        </ul>
      </aside>

      {/* Thread */}
      <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white">
        {!activeId ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <h1 className="text-lg font-semibold text-slate-900">AI Assistant</h1>
            <p className="mt-2 max-w-md text-sm text-slate-500">
              Ask questions about your company knowledge. Answers cite the sources they were
              grounded in. Start a new conversation to begin.
            </p>
            <button
              type="button"
              onClick={() => void startConversation()}
              className="mt-4 cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-indigo-700"
            >
              Start a conversation
            </button>
          </div>
        ) : (
          <>
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="truncate text-sm font-medium text-slate-900">
                {active?.title || 'New conversation'}
              </p>
            </div>

            <div className="flex-1 space-y-4 overflow-auto p-4">
              {threadLoading && <p className="text-sm text-slate-500">Loading messages…</p>}
              {threadError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                  <p className="text-sm text-rose-700" role="alert">
                    {threadError}
                  </p>
                  <button
                    type="button"
                    onClick={() => void loadThread(activeId)}
                    className="mt-2 cursor-pointer rounded-lg bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700"
                  >
                    Retry
                  </button>
                </div>
              )}
              {!threadLoading && !threadError && messages.length === 0 && (
                <p className="text-sm text-slate-500">
                  No messages yet. Ask your first question below.
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                      m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.role === 'assistant' &&
                      m.runMetadata?.errorCategory === 'not_configured' && (
                        <Link
                          href="/settings/ai-providers"
                          className="mt-2 inline-block text-xs font-medium text-indigo-600 underline hover:text-indigo-800"
                        >
                          Configure AI providers →
                        </Link>
                      )}
                    {m.role === 'assistant' &&
                      Array.isArray(m.citations) &&
                      m.citations.length > 0 && (
                        <ul className="mt-2 space-y-1 border-t border-slate-200 pt-2">
                          <li className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Sources
                          </li>
                          {m.citations.map((cit, i) => (
                            <li
                              key={cit.chunkId || cit.sourceId || i}
                              className="text-xs text-slate-600"
                            >
                              <span className="font-medium text-indigo-700">
                                {cit.title || 'Source'}
                              </span>
                              {cit.content ? ` — ${cit.content.slice(0, 120)}…` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-500">
                    Thinking…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={(e) => void send(e)} className="border-t border-slate-100 p-3">
              <label htmlFor="chat-input" className="sr-only">
                Message
              </label>
              <div className="flex gap-2">
                <input
                  id="chat-input"
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask about your company knowledge…"
                  disabled={sending}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
              {sendError && (
                <p className="mt-2 text-sm text-rose-600" role="alert">
                  {sendError}
                </p>
              )}
            </form>
          </>
        )}
      </section>
    </div>
  );
}
