import { Injectable } from '@nestjs/common';
import { PapersImplService } from 'src/news/application/papers/papers-impl.service';

export type {
  PaperSource,
  Paper,
  PaperListResult,
  PaperTrendKeyword,
  PaperTrendSummary,
} from 'src/news/application/papers/papers-impl.service';

@Injectable()
export class PapersService {
  constructor(private readonly impl: PapersImplService) {}

  getPapers(
    options: {
      source?: string;
      limit?: number;
      refresh?: boolean;
      bookmarked?: boolean;
    } = {},
  ) {
    return this.impl.getPapers(options);
  }

  summarizePaper(
    id: string,
    options: { model?: string; refresh?: boolean } = {},
  ) {
    return this.impl.summarizePaper(id, options);
  }

  findById(id: string) {
    return this.impl.findById(id);
  }

  setBookmark(id: string, bookmarked: boolean) {
    return this.impl.setBookmark(id, bookmarked);
  }

  setRead(id: string, read = true) {
    return this.impl.setRead(id, read);
  }

  getChatMessages(id: string) {
    return this.impl.getChatMessages(id);
  }

  saveChatMessages(
    id: string,
    messages: { role: string; content: string }[],
  ) {
    return this.impl.saveChatMessages(id, messages);
  }

  clearChatMessages(id: string) {
    return this.impl.clearChatMessages(id);
  }

  fetchPdfBuffer(id: string) {
    return this.impl.fetchPdfBuffer(id);
  }

  getTrendSummary(
    options: {
      model?: string;
      refresh?: boolean;
      onChunk?: (chunk: string) => void;
    } = {},
  ) {
    return this.impl.getTrendSummary(options);
  }

  getLatestStoredTrendSummary(options: { model?: string } = {}) {
    return this.impl.getLatestStoredTrendSummary(options);
  }
}
