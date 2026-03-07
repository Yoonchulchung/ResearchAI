import { Session, ItemWithResult } from '../../../domain/session.model';

export class ItemResponseDto {
  id: number;
  itemId: string;
  title: string;
  icon: string;
  prompt: string;
  status: string;
  result: string | null;

  static from(item: ItemWithResult): ItemResponseDto {
    const dto = new ItemResponseDto();
    dto.id = item.id;
    dto.itemId = item.itemId;
    dto.title = item.title;
    dto.icon = item.icon;
    dto.prompt = item.prompt;
    dto.status = item.status;
    dto.result = item.result;
    return dto;
  }
}

export class SessionResponseDto {
  id: string;
  topic: string;
  researchCloudAIModel: string;
  researchLocalAIModel: string;
  researchWebModel: string;
  researchState?: string;
  createdAt: string;
  summary?: string | null;
  items?: ItemResponseDto[];
  doneCount?: number;

  static from(session: Session): SessionResponseDto {
    const dto = new SessionResponseDto();
    dto.id = session.id;
    dto.topic = session.topic;
    dto.researchCloudAIModel = session.researchCloudAIModel;
    dto.researchLocalAIModel = session.researchLocalAIModel;
    dto.researchWebModel = session.researchWebModel;
    dto.researchState = session.researchState;
    dto.createdAt = session.createdAt;
    dto.summary = session.summary;
    dto.items = session.items?.map(ItemResponseDto.from);
    dto.doneCount = session.doneCount;
    return dto;
  }
}
