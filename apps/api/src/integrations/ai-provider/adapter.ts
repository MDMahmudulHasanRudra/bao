import { getEnv } from '../../core/config/env.js';
import { createChildLogger } from '../../core/logging/logger.js';

const log = createChildLogger('ai-provider');

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

export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const env = getEnv();

  try {
    // Provider adapter pattern - swap implementation per provider
    if (env.AI_PROVIDER === 'openai') {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.AI_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.AI_EMBEDDING_MODEL,
          input: text,
          dimensions: env.AI_EMBEDDING_DIMENSIONS,
        }),
      });

      if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
      const data = (await response.json()) as {
        data: { embedding: number[] }[];
        usage: { total_tokens: number };
      };

      return {
        embedding: data.data[0].embedding,
        model: env.AI_EMBEDDING_MODEL,
        tokens: data.usage.total_tokens,
      };
    }

    throw new Error(`Unsupported AI provider: ${env.AI_PROVIDER}`);
  } catch (err) {
    log.error({ err, provider: env.AI_PROVIDER }, 'Embedding generation failed');
    throw err;
  }
}

export async function generateCompletion(
  systemPrompt: string,
  userMessage: string,
  context?: string,
): Promise<CompletionResult> {
  const env = getEnv();
  const start = Date.now();

  try {
    if (env.AI_PROVIDER === 'openai') {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...(context ? [{ role: 'system', content: `Context:\n${context}` }] : []),
        { role: 'user', content: userMessage },
      ];

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.AI_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.AI_MODEL,
          messages,
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
      const data = (await response.json()) as {
        choices: { message: { content: string } }[];
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      const latencyMs = Date.now() - start;
      return {
        content: data.choices[0].message.content,
        metadata: {
          provider: env.AI_PROVIDER,
          model: env.AI_MODEL,
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
          latencyMs,
          status: 'success',
        },
      };
    }

    throw new Error(`Unsupported AI provider: ${env.AI_PROVIDER}`);
  } catch (err) {
    const latencyMs = Date.now() - start;
    log.error({ err, provider: env.AI_PROVIDER }, 'Completion generation failed');
    return {
      content:
        'I apologize, but I am unable to process your request at this time. Please try again later.',
      metadata: {
        provider: env.AI_PROVIDER,
        model: env.AI_MODEL,
        latencyMs,
        status: 'error',
        errorCategory: categorizeError(err as Error),
      },
    };
  }
}

function categorizeError(err: Error): string {
  if (err.message.includes('429')) return 'rate_limit';
  if (err.message.includes('401') || err.message.includes('403')) return 'auth';
  if (err.message.includes('timeout')) return 'timeout';
  if (err.message.includes('500') || err.message.includes('502') || err.message.includes('503'))
    return 'server_error';
  return 'unknown';
}
