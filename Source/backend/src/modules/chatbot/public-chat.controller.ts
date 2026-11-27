import { Body, Controller, HttpCode, Ip, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/guards/auth.decorators.js';
import { localeOf } from '../../common/i18n/locale.js';
import { ChatbotService } from './chatbot.service.js';
import { clientAbortSignal } from './client-abort.js';
import { ChatRequestDto } from './dto/chat.dto.js';

// CHAT-01: public, no auth; POST so app.setup keeps Cache-Control: no-store.
@Controller('public')
export class PublicChatController {
  constructor(private readonly chat: ChatbotService) {}

  @Public()
  @HttpCode(200)
  @Post('chat')
  reply(
    @Body() dto: ChatRequestDto,
    @Ip() ip: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ reply: string }> {
    return this.chat.reply(dto, ip, localeOf(req), clientAbortSignal(res));
  }
}
