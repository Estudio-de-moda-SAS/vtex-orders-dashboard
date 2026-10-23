import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

/** Un turno previo de la conversación — el frontend reenvía el historial completo en cada pregunta (sin estado en el servidor entre peticiones). */
export class ChatMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(8000)
  content!: string;
}

/** Input de `POST /api/assistant/chat`. */
export class AssistantChatRequestDto {
  @IsNotEmpty({ message: 'question es obligatorio' })
  @IsString()
  @MaxLength(2000, { message: 'La pregunta es demasiado larga (máximo 2000 caracteres)' })
  question!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40, { message: 'El historial es demasiado largo para esta conversación — empieza una nueva.' })
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];
}
