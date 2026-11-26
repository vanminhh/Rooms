import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength,
  Validate, ValidateNested, ValidatorConstraint, type ValidatorConstraintInterface,
} from 'class-validator';

// A-28: at most 20 messages per conversation, at most 500 characters per message (after trim).
export const CHAT_MAX_MESSAGES = 20;
export const CHAT_MAX_CHARS = 500;

const ROLE_MSG = 'Vai trò tin nhắn không hợp lệ';
const CONTENT_MSG = 'Tin nhắn phải có từ 1 đến 500 ký tự';
const COUNT_MSG = 'Hội thoại phải có từ 1 đến 20 tin nhắn';
const TURNS_MSG = 'Hội thoại phải xen kẽ khách và trợ lý, bắt đầu và kết thúc bằng tin của khách';
const ROOM_MSG = 'Mã phòng không hợp lệ';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

// CHAT-01: user, assistant, user, ... ending with user, so the length is odd.
@ValidatorConstraint({ name: 'chatTurns' })
class ChatTurns implements ValidatorConstraintInterface {
  validate(messages: unknown): boolean {
    if (!Array.isArray(messages) || messages.length === 0) return true; // the count rules report these
    return messages.length % 2 === 1
      && messages.every((m, i) => (m as { role?: unknown } | null)?.role === (i % 2 === 0 ? 'user' : 'assistant'));
  }
}

export class ChatMessageDto {
  @IsIn(['user', 'assistant'], { message: ROLE_MSG })
  role!: 'user' | 'assistant';

  @Transform(trim)
  @IsString({ message: CONTENT_MSG })
  @MinLength(1, { message: CONTENT_MSG })
  @MaxLength(CHAT_MAX_CHARS, { message: CONTENT_MSG })
  content!: string;
}

export class ChatRequestDto {
  @IsArray({ message: COUNT_MSG })
  @ArrayMinSize(1, { message: COUNT_MSG })
  @ArrayMaxSize(CHAT_MAX_MESSAGES, { message: COUNT_MSG })
  @Validate(ChatTurns, { message: TURNS_MSG })
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @IsOptional()
  @IsInt({ message: ROOM_MSG })
  @Min(1, { message: ROOM_MSG })
  @Max(2147483647, { message: ROOM_MSG })
  roomId?: number;
}
