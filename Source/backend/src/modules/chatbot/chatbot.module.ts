import { Module } from '@nestjs/common';
import { BuildingsModule } from '../buildings/buildings.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { anthropicProvider } from './anthropic.provider.js';
import { ChatbotService } from './chatbot.service.js';
import { PublicChatController } from './public-chat.controller.js';

@Module({
  imports: [RoomsModule, BuildingsModule],
  controllers: [PublicChatController],
  providers: [ChatbotService, anthropicProvider],
})
export class ChatbotModule {}
