import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength,
  Validate, ValidateNested, ValidatorConstraint, type ValidatorConstraintInterface,
} from 'class-validator';

// A-29: at most 20 messages per conversation, at most 500 characters per message (after trim).
export const CHAT_MAX_MESSAGES = 20;
export const CHAT_MAX_CHARS = 500;

const ROLE_MSG = 'Vai trò tin nhắn không hợp lệ';
const CONTENT_MSG = 'Tin nhắn phải có từ 1 đến 500 ký tự';
const COUNT_MSG = 'Hội thoại phải có từ 1 đến 20 tin nhắn';
const TURNS_MSG = 'Hội thoại phải xen kẽ khách và trợ lý, bắt đầu và kết thúc bằng tin của khách';
const ROOM_MSG = 'Mã phòng không hợp lệ';
const IMAGE_MSG = 'Ảnh không hợp lệ';
const IMAGE_TYPE_MSG = 'Ảnh phải là JPG, PNG hoặc WebP';
const IMAGE_DATA_MSG = 'Ảnh phải là base64 và không quá 1,5 MB';

// CHAT-11: the browser sends a shrunk JPEG; the BE still checks type, base64 shape and decoded size.
export const CHAT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const CHAT_IMAGE_MAX_BYTES = 1_572_864; // 1.5 MB decoded

@ValidatorConstraint({ name: 'chatImageData' })
class ChatImageData implements ValidatorConstraintInterface {
  validate(data: unknown): boolean {
    if (typeof data !== 'string' || data.length === 0 || data.length % 4 !== 0) return false;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return false;
    const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
    return (data.length / 4) * 3 - padding <= CHAT_IMAGE_MAX_BYTES;
  }
}

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

export class ChatImageDto {
  @IsIn(CHAT_IMAGE_TYPES, { message: IMAGE_TYPE_MSG })
  mediaType!: (typeof CHAT_IMAGE_TYPES)[number];

  @Validate(ChatImageData, { message: IMAGE_DATA_MSG })
  data!: string;
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

  // CHAT-11: one image, attached by the service to the last visitor message only.
  @IsOptional()
  @IsObject({ message: IMAGE_MSG })
  @ValidateNested()
  @Type(() => ChatImageDto)
  image?: ChatImageDto;
}
