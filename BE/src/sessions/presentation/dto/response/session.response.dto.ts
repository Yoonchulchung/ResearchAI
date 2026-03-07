export class SessionResponseDto {
  id: string;
  topic: string;
  aiModel: string;
  webModel: string;
  createdAt: string;
  summary?: string | null;
}
