import { Session, ItemWithResult } from 'src/sessions/domain/session.model';

export class ItemResponseDto {
  id: number;
  itemId: string;
  title: string;
  webSearchPrompt: string;
  status: string;
  researchState?: string;
  webResult: string | null;
  webModel: string;
  usedWebModel: string | null;
  searchLog: { query: string; result: string }[] | null;
  aiResult: string | null;
  confidence: { score: number; reason: string } | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedFees: number | null;
  referenceCount: number | null;

  static from(item: ItemWithResult): ItemResponseDto {
    const dto = new ItemResponseDto();
    dto.id = item.id;
    dto.itemId = item.itemId;
    dto.title = item.title;
    dto.webSearchPrompt = item.webSearchPrompt;
    dto.status = item.status;
    dto.researchState = item.researchState;
    dto.webResult = item.webResult;
    dto.webModel = item.webModel;
    dto.usedWebModel = item.usedWebModel;
    dto.searchLog = item.searchLog;
    dto.aiResult = item.result;
    dto.confidence =
      item.confidenceScore != null
        ? { score: item.confidenceScore, reason: item.confidenceReason ?? '' }
        : null;
    dto.inputTokens = item.inputTokens;
    dto.outputTokens = item.outputTokens;
    dto.estimatedFees = item.estimatedFees;
    dto.referenceCount = item.result
      ? (item.result.match(/\[.+?\]\(https?:\/\/[^)]+\)/g) ?? []).length
      : null;
    return dto;
  }
}

export class SessionResponseDto {
  id: string;
  userId: string | null;
  topic: string;
  researchCloudAIModel: string;
  researchLocalAIModel: string;
  researchWebModel: string;
  researchState?: string;
  summaryState?: string | null;
  createdAt: string;
  summary?: string | null;
  items?: ItemResponseDto[];
  doneCount?: number;
  sessionType?: string;
  lightResearchId?: string | null;

  static from(session: Session): SessionResponseDto {
    const dto = new SessionResponseDto();
    dto.id = session.id;
    dto.userId = session.userId ?? null;
    dto.topic = session.topic;
    dto.researchCloudAIModel = session.researchCloudAIModel;
    dto.researchLocalAIModel = session.researchLocalAIModel;
    dto.researchWebModel = session.researchWebModel;
    dto.researchState = session.researchState;
    dto.summaryState = session.summaryState;
    dto.createdAt = session.createdAt;
    dto.summary = session.summary;
    dto.items = session.items?.map(ItemResponseDto.from);
    dto.doneCount = session.doneCount;
    dto.sessionType = session.sessionType;
    dto.lightResearchId = session.lightResearchId;
    return dto;
  }
}
