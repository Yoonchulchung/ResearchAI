export class SessionResponseDto {
  id: string;
  topic: string;
  researchCloudAIModel: string;
  researchLocalAIModel: string;
  researchWebModel: string;
  createdAt: string;
  summary?: string | null;

  static from(session: { id: string; topic: string; researchCloudAIModel: string; researchLocalAIModel: string; researchWebModel: string; createdAt: string; summary?: string | null }): SessionResponseDto {
    const dto = new SessionResponseDto();
    dto.id = session.id;
    dto.topic = session.topic;
    dto.researchCloudAIModel = session.researchCloudAIModel;
    dto.researchLocalAIModel = session.researchLocalAIModel;
    dto.researchWebModel = session.researchWebModel;
    dto.createdAt = session.createdAt;
    dto.summary = session.summary;
    return dto;
  }
}
