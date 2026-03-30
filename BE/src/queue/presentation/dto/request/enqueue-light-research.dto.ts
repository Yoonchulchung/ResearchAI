import { SearchModeInput } from '../../../../research/application/search-planner.service';
import { SearchEngine } from 'src/research/domain/model/search-planner.model';

export interface AttachedFilePayload {
  type: string;        // 'image' | 'pdf' | 'docx'
  mediaType?: string;  // 'image/jpeg' | 'image/png' etc.
  dataUrl?: string;    // base64 data URL for images
  text?: string;       // extracted text for PDFs/docs
}

export class EnqueueLightResearchDto {
  topic: string;
  localAIModel: string;
  cloudAIModel: string;
  webModel: SearchEngine;
  searchMode?: SearchModeInput;
  attachedFiles?: AttachedFilePayload[];
}
