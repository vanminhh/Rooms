import Anthropic from '@anthropic-ai/sdk';
import type { FactoryProvider } from '@nestjs/common';

export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');

// CHAT-06: no key -> null, the app still starts and the chat answers CHAT_UNAVAILABLE.
// The key is passed explicitly so the SDK never falls back to other credentials on the host.
export const anthropicProvider: FactoryProvider<Anthropic | null> = {
  provide: ANTHROPIC_CLIENT,
  useFactory: () => {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    return apiKey ? new Anthropic({ apiKey, maxRetries: 0 }) : null;
  },
};
