import type Anthropic from '@anthropic-ai/sdk';
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages.js';
import { HttpException, HttpStatus, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { formatDateVn, todayHanoi } from '../../common/date/today.js';
import { ErrorCode } from '../../common/errors/error-code.js';
import type { Lang } from '../../common/i18n/locale.js';
import { PublicBuildingsService } from '../buildings/public-buildings.service.js';
import { RateLimiter } from '../auth/rate-limiter.js';
import { PublicRoomsService } from '../rooms/public-rooms.service.js';
import { ANTHROPIC_CLIENT } from './anthropic.provider.js';
import { chatSystem } from './chat-prompt.js';
import { chatTools } from './chat-tools.js';
import type { ChatRequestDto } from './dto/chat.dto.js';

export const CHAT_MODEL = 'claude-haiku-5-5'; // D-49, CHAT-02
export const CHAT_RATE_MAX = 20; // A-28, CHAT-03
export const CHAT_RATE_WINDOW_MS = 60 * 60 * 1000;
// Owner 26/11/2026: at most 4 model calls and 15 s per answer, then CHAT_UNAVAILABLE.
export const CHAT_MAX_ITERATIONS = 4;
export const CHAT_TIMEOUT_MS = 15_000;
const CHAT_MAX_TOKENS = 2048;

const unavailable = () => new ServiceUnavailableException(ErrorCode.CHAT_UNAVAILABLE);

function replyText(message: BetaMessage): string {
  // refusal = the model declined; tool_use = the 4-call budget ran out mid-answer (CHAT-06).
  if (message.stop_reason !== 'end_turn' && message.stop_reason !== 'max_tokens') return '';
  return message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n').trim();
}

@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);
  // shortcut: in-memory, single instance only (same as AUTH-04); move to a shared store before running more than one instance
  private readonly limiter = new RateLimiter(CHAT_RATE_MAX, CHAT_RATE_WINDOW_MS);

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic | null,
    private readonly rooms: PublicRoomsService,
    private readonly buildings: PublicBuildingsService,
  ) {}

  // CHAT-07: nothing is stored and message text is never logged.
  async reply(dto: ChatRequestDto, ip: string, lang: Lang): Promise<{ reply: string }> {
    // isBlocked + record run without an await in between, so parallel requests cannot both pass the 20th slot.
    if (this.limiter.isBlocked(ip)) throw new HttpException(ErrorCode.TOO_MANY_REQUESTS, HttpStatus.TOO_MANY_REQUESTS);
    this.limiter.record(ip);
    if (!this.client) throw unavailable();

    let message: BetaMessage;
    try {
      message = await this.client.beta.messages.toolRunner(
        {
          model: CHAT_MODEL,
          max_tokens: CHAT_MAX_TOKENS,
          output_config: { effort: 'low' },
          system: chatSystem(formatDateVn(todayHanoi()), dto.roomId),
          tools: chatTools(this.rooms, this.buildings, lang),
          messages: dto.messages.map((m) => ({ role: m.role, content: m.content })),
          max_iterations: CHAT_MAX_ITERATIONS,
        },
        { signal: AbortSignal.timeout(CHAT_TIMEOUT_MS) },
      );
    } catch (error) {
      this.logger.warn(`chat provider failed: ${error instanceof Error ? error.name : 'unknown'}`);
      throw unavailable();
    }
    const reply = replyText(message);
    if (!reply) {
      this.logger.warn(`chat gave no answer: ${message.stop_reason ?? 'unknown'}`);
      throw unavailable();
    }
    return { reply };
  }
}
