export interface AttachedTextDto {
  filename: string;
  text: string;
}

export class ChatMessageDto {
  message: string;
  model: string;
  attachedTexts?: AttachedTextDto[];
}
