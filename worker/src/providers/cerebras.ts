import type { Message, CallResult, Provider } from './types.js';
import { callOpenAICompat } from './openai-compat.js';

const BASE_URL = 'https://api.cerebras.ai/v1';

const CEREBRAS_MODELS = [
  { id: 'qwen-3-235b-a22b-instruct-2507', label: 'cerebras/qwen-3-235b' },
  { id: 'llama3.1-8b', label: 'cerebras/llama-3.1-8b' },
  { id: 'gpt-oss-120b', label: 'cerebras/gpt-oss-120b' },
];

export function makeCerebrasProviders(apiKey: string): Provider[] {
  return CEREBRAS_MODELS.map(({ id, label }) => ({
    label,
    call(messages: Message[]): Promise<CallResult> {
      return callOpenAICompat(BASE_URL, apiKey, id, messages);
    },
  }));
}
