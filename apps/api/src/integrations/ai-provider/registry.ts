export const CAPABILITIES = [
  'chat_rag',
  'embeddings',
  'proposal_draft',
  'presentation_brief',
  'evaluation',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type WireProtocol = 'openai' | 'gemini' | 'anthropic';

export interface ProviderDef {
  id: string;
  name: string;
  wire: WireProtocol;
  baseUrl: string;
  docsUrl: string;
  keyHint: string;
  requireBaseUrl?: boolean;
  supportsEmbeddings: boolean;
  catalogue: { chat: string[]; embeddings: string[] };
}

// Approved provider registry — new providers are added here, not as scattered conditionals.
export const PROVIDER_REGISTRY: Record<string, ProviderDef> = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    wire: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    docsUrl: 'https://openrouter.ai/keys',
    keyHint: 'sk-or-… (OpenRouter API key)',
    supportsEmbeddings: false,
    catalogue: {
      chat: ['openai/gpt-4o-mini', 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet'],
      embeddings: [],
    },
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    wire: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    docsUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-… (OpenAI API key)',
    supportsEmbeddings: true,
    catalogue: {
      chat: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
      embeddings: ['text-embedding-3-small', 'text-embedding-3-large'],
    },
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    wire: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    docsUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'AIza… (Google AI Studio key)',
    supportsEmbeddings: true,
    catalogue: {
      chat: ['gemini-2.0-flash', 'gemini-1.5-pro'],
      embeddings: ['text-embedding-004'],
    },
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    wire: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-… (Anthropic API key)',
    supportsEmbeddings: false,
    catalogue: {
      chat: ['claude-3-5-haiku-latest', 'claude-3-5-sonnet-latest'],
      embeddings: [],
    },
  },
  'openai-compatible': {
    id: 'openai-compatible',
    name: 'OpenAI-compatible endpoint',
    wire: 'openai',
    baseUrl: '',
    docsUrl: 'https://platform.openai.com/docs/api-reference',
    keyHint: 'Key as required by your endpoint',
    requireBaseUrl: true,
    supportsEmbeddings: true,
    catalogue: { chat: [], embeddings: [] },
  },
};

export function getProviderDef(provider: string): ProviderDef | undefined {
  return PROVIDER_REGISTRY[provider];
}

export function resolveBaseUrl(def: ProviderDef, storedBaseUrl?: string | null): string {
  const base = (def.requireBaseUrl ? storedBaseUrl : def.baseUrl) || def.baseUrl;
  return base.replace(/\/+$/, '');
}

export function isEmbeddingModel(modelId: string): boolean {
  return /embedding/i.test(modelId);
}

export function modelCapabilities(modelId: string, def: ProviderDef): Capability[] {
  if (isEmbeddingModel(modelId)) return def.supportsEmbeddings ? ['embeddings'] : [];
  return ['chat_rag', 'proposal_draft', 'presentation_brief', 'evaluation'];
}

export function isModelCompatible(
  modelId: string,
  capability: Capability,
  def: ProviderDef,
): boolean {
  return modelCapabilities(modelId, def).includes(capability);
}
