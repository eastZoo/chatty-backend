// src/messages/dto/create-message.dto.ts
import { IsString, IsOptional, IsArray } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  content: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  fileIds?: string[];
}
