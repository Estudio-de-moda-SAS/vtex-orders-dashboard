import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';

import { AssistantChatService } from './assistant-chat.service';
import { AssistantChatRequestDto } from './dto/assistant-chat.dto';
import { AssistantRateLimitGuard } from './guards/assistant-rate-limit.guard';

/**
 * `POST /api/assistant/chat` — Server-Sent Events: cada trozo de texto que
 * genera el modelo llega como un evento `message` apenas se produce (ver
 * `AssistantChatService.streamChat`), para que el chat del frontend se vea
 * escribiéndose en vivo en vez de esperar la respuesta completa.
 */
@Controller('api/assistant')
export class AssistantController {
  constructor(private readonly chatService: AssistantChatService) {}

  @Post('chat')
  @UseGuards(AssistantRateLimitGuard)
  async chat(@Body() body: AssistantChatRequestDto, @Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      for await (const chunk of this.chatService.streamChat(body.question, body.history ?? [])) {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    } catch (error) {
      res.write(`data: ${JSON.stringify({ error: 'Error inesperado del asistente.' })}\n\n`);
    } finally {
      res.end();
    }
  }
}
