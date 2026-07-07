import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';

/** Pick a direct provider model from env (no AI Gateway → fully self-hostable). */
export function pickModel() {
  if (process.env.OPENAI_API_KEY) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openai(process.env.HELIX_MODEL_DRAFT || 'gpt-4o-mini');
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropic(process.env.HELIX_MODEL_QUALITY || 'claude-sonnet-4-5');
  }
  throw new Error('Set OPENAI_API_KEY or ANTHROPIC_API_KEY for the eve agent.');
}
