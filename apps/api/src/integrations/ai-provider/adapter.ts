import { getEnv } from '../../core/config/env.js';
import { createChildLogger } from '../../core/logging/logger.js';
import {
  getProviderDef,
  resolveBaseUrl,
  modelCapabilities,
  type Capability,
  type ProviderDef,
} from './registry.js';

const log = createChildLogger('ai-provider');

const TIMEOUT_MS = 10_000;

export interface AiRunMetadata {
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs: number;
  status: 'success' | 'error';
  errorCategory?: string;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokens: number;
}

export interface CompletionResult {
  content: string;
  metadata: AiRunMetadata;
}

export interface ResolvedRun {
  provider: ProviderDef;
  modelId: string;
  apiKey: string;
  baseUrl: string;
}

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

export interface DiscoveredModels {
  models: Array<{ id: string; capabilities: Capability[] }>;
  source: 'discovery' | 'catalogue';
}

export class AiNotConfiguredError extends Error {
  constructor(message = 'AI provider is not configured for this organization') {
    super(message);
    this.name = 'AiNotConfiguredError';
  }
}

/**
 * Resolve organization policy → capability default → provider adapter/model.
 * Reads only DB rows scoped by organization_id; never env keys, never browser input.
 */
export async function resolveOrgRun(
  organizationId: string,
  capability: Capability,
): Promise<ResolvedRun | null> {
  const { getDb } = await import('../../db/index.js');
  const { aiModelDefaults, aiProviders } = await import('../../db/schema.js');
  const { eq, and } = await import('drizzle-orm');
  const { decryptSecret } = await import('../../core/security/secret-box.js');

  const db = getDb();
  const [defRow] = await db
    .select()
    .from(aiModelDefaults)
    .where(
      and(
        eq(aiModelDefaults.organizationId, organizationId),
        eq(aiModelDefaults.capability, capability),
      ),
    )
    .limit(1);
  if (!defRow) return null;

  const [provRow] = await db
    .select()
    .from(aiProviders)
    .where(
      and(
        eq(aiProviders.organizationId, organizationId),
        eq(aiProviders.provider, defRow.provider),
        eq(aiProviders.status, 'active'),
      ),
    )
    .limit(1);
  if (!provRow) return null;

  const def = getProviderDef(provRow.provider);
  if (!def) return null;

  return {
    provider: def,
    modelId: defRow.modelId,
    apiKey: decryptSecret(provRow.encryptedKey),
    baseUrl: resolveBaseUrl(def, provRow.baseUrl),
  };
}

function authHeaders(wire: string, apiKey: string): Record<string, string> {
  if (wire === 'anthropic') {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    };
  }
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
}

function chatUrl(run: ResolvedRun): string {
  const { wire } = run.provider;
  if (wire === 'gemini') {
    return `${run.baseUrl}/models/${run.modelId}:generateContent`;
  }
  if (wire === 'anthropic') return `${run.baseUrl}/messages`;
  return `${run.baseUrl}/chat/completions`;
}

function embeddingsUrl(run: ResolvedRun): string {
  const { wire } = run.provider;
  if (wire === 'gemini') return `${run.baseUrl}/models/${run.modelId}:embedContent`;
  return `${run.baseUrl}/embeddings`;
}

function geminiHeaders(apiKey: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
}

export async function generateEmbedding(
  text: string,
  organizationId: string,
): Promise<EmbeddingResult> {
  const run = await resolveOrgRun(organizationId, 'embeddings');
  if (!run) throw new AiNotConfiguredError('No embedding model configured for this organization');

  try {
    const { wire } = run.provider;
    const isGemini = wire === 'gemini';
    const body = isGemini
      ? { model: `models/${run.modelId}`, content: { parts: [{ text }] } }
      : { model: run.modelId, input: text };

    const response = await fetch(embeddingsUrl(run), {
      method: 'POST',
      headers: isGemini ? geminiHeaders(run.apiKey) : authHeaders(wire, run.apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Provider API error: ${response.status}`);

    const data = (await response.json()) as {
      data?: { embedding: number[] }[];
      embedding?: { values: number[] };
      usage?: { total_tokens: number };
    };
    const embedding = data.data?.[0]?.embedding ?? data.embedding?.values;
    if (!embedding) throw new Error('Provider returned no embedding');
    return {
      embedding,
      model: run.modelId,
      tokens: data.usage?.total_tokens ?? 0,
    };
  } catch (err) {
    log.error({ err, provider: run.provider.id }, 'Embedding generation failed');
    throw err;
  }
}

export async function generateCompletion(
  systemPrompt: string,
  userMessage: string,
  context?: string,
  organizationId?: string,
): Promise<CompletionResult> {
  const start = Date.now();

  let run: ResolvedRun | null = null;
  if (organizationId) {
    try {
      run = await resolveOrgRun(organizationId, 'chat_rag');
    } catch (err) {
      log.error({ err }, 'Policy resolution failed');
    }
  }

  if (!run) {
    return {
      content:
        'AI is not configured for this organization yet. An owner or admin can connect a provider in Settings → AI Providers, then retry.',
      metadata: {
        provider: 'unconfigured',
        model: 'none',
        latencyMs: Date.now() - start,
        status: 'error',
        errorCategory: 'not_configured',
      },
    };
  }

  try {
    const { wire } = run.provider;
    const url = chatUrl(run);
    let body: unknown;
    const headers = wire === 'gemini' ? geminiHeaders(run.apiKey) : authHeaders(wire, run.apiKey);

    if (wire === 'gemini') {
      body = {
        systemInstruction: {
          parts: [{ text: systemPrompt + (context ? `\nContext:\n${context}` : '') }],
        },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: 2000 },
      };
    } else if (wire === 'anthropic') {
      body = {
        model: run.modelId,
        max_tokens: 2000,
        system: systemPrompt + (context ? `\nContext:\n${context}` : ''),
        messages: [{ role: 'user', content: userMessage }],
      };
    } else {
      body = {
        model: run.modelId,
        messages: [
          { role: 'system', content: systemPrompt },
          ...(context ? [{ role: 'system', content: `Context:\n${context}` }] : []),
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Provider API error: ${response.status}`);

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      content?: { parts?: { text?: string }[] };
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        input_tokens?: number;
        output_tokens?: number;
      };
    };

    let content = '';
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    let totalTokens: number | undefined;

    if (wire === 'gemini') {
      content = (data.content?.parts ?? []).map((p) => p.text ?? '').join('');
      promptTokens = data.usage?.input_tokens;
      completionTokens = data.usage?.output_tokens;
      totalTokens = data.usage?.total_tokens;
    } else if (wire === 'anthropic') {
      content = (data as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? '';
      promptTokens = data.usage?.input_tokens;
      completionTokens = data.usage?.output_tokens;
      totalTokens = (promptTokens ?? 0) + (completionTokens ?? 0);
    } else {
      content = data.choices?.[0]?.message?.content ?? '';
      promptTokens = data.usage?.prompt_tokens;
      completionTokens = data.usage?.completion_tokens;
      totalTokens = data.usage?.total_tokens;
    }

    return {
      content,
      metadata: {
        provider: run.provider.id,
        model: run.modelId,
        promptTokens,
        completionTokens,
        totalTokens,
        latencyMs: Date.now() - start,
        status: 'success',
      },
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    log.error({ err, provider: run.provider.id }, 'Completion generation failed');
    return {
      content:
        'I apologize, but I am unable to process your request at this time. Please try again later.',
      metadata: {
        provider: run.provider.id,
        model: run.modelId,
        latencyMs,
        status: 'error',
        errorCategory: categorizeError(err as Error),
      },
    };
  }
}

export async function testConnection(
  provider: string,
  apiKey: string,
  baseUrl?: string | null,
): Promise<TestConnectionResult> {
  const def = getProviderDef(provider);
  if (!def) return { ok: false, message: 'Unknown provider' };
  const base = resolveBaseUrl(def, baseUrl);

  try {
    const url = def.wire === 'gemini' ? `${base}/models` : `${base}/models`;
    const headers =
      def.wire === 'gemini' ? { 'x-goog-api-key': apiKey } : authHeaders(def.wire, apiKey);
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.ok) return { ok: true, message: 'Connection verified' };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Key rejected by provider (unauthorized)' };
    }
    if (def.requireBaseUrl && (res.status === 404 || res.status === 405)) {
      return { ok: true, message: 'Endpoint reachable (model list not supported)' };
    }
    if (res.status === 429) return { ok: false, message: 'Provider rate limit hit; retry shortly' };
    return { ok: false, message: `Provider returned HTTP ${res.status}` };
  } catch (err) {
    const msg =
      (err as Error).name === 'TimeoutError' || (err as Error).name === 'AbortError'
        ? 'Connection timed out'
        : 'Could not reach provider';
    return { ok: false, message: msg };
  }
}

export async function discoverModels(
  provider: string,
  apiKey: string,
  baseUrl?: string | null,
): Promise<DiscoveredModels> {
  const def = getProviderDef(provider);
  if (!def) return { models: [], source: 'catalogue' };
  const base = resolveBaseUrl(def, baseUrl);

  try {
    const headers =
      def.wire === 'gemini' ? { 'x-goog-api-key': apiKey } : authHeaders(def.wire, apiKey);
    const res = await fetch(`${base}/models`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        data?: Array<{ id: string }>;
        models?: Array<{ name: string }>;
      };
      const ids =
        def.wire === 'gemini'
          ? (data.models ?? []).map((m) => m.name.replace(/^models\//, ''))
          : (data.data ?? []).map((m) => m.id);
      if (ids.length > 0) {
        return {
          models: ids.map((id) => ({ id, capabilities: modelCapabilities(id, def) })),
          source: 'discovery',
        };
      }
    }
  } catch {
    // fall through to approved catalogue
  }

  const ids = [...def.catalogue.chat, ...def.catalogue.embeddings];
  return {
    models: ids.map((id) => ({ id, capabilities: modelCapabilities(id, def) })),
    source: 'catalogue',
  };
}

function categorizeError(err: Error): string {
  if (err.message.includes('429')) return 'rate_limit';
  if (err.message.includes('401') || err.message.includes('403')) return 'auth';
  if (err.message.includes('timeout') || err.name === 'TimeoutError') return 'timeout';
  if (err.message.includes('500') || err.message.includes('502') || err.message.includes('503'))
    return 'server_error';
  return 'unknown';
}

// Kept for backward compatibility with env-based callers outside org scope.
export function legacyEnvProviderConfigured(): boolean {
  try {
    return getEnv().AI_API_KEY.length > 0;
  } catch {
    return false;
  }
}
