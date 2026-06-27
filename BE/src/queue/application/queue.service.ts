import { Injectable } from '@nestjs/common';
import { QueueWorkflowService } from 'src/queue/application/queue/queue-workflow.service';

@Injectable()
export class QueueService {
  constructor(private readonly workflow: QueueWorkflowService) {}

  getStatus(): ReturnType<QueueWorkflowService['getStatus']> {
    return this.workflow.getStatus();
  }

  cancelBySession(
    ...args: Parameters<QueueWorkflowService['cancelBySession']>
  ): ReturnType<QueueWorkflowService['cancelBySession']> {
    return this.workflow.cancelBySession(...args);
  }

  cancelByItem(
    ...args: Parameters<QueueWorkflowService['cancelByItem']>
  ): ReturnType<QueueWorkflowService['cancelByItem']> {
    return this.workflow.cancelByItem(...args);
  }

  getSummaryObservable(
    ...args: Parameters<QueueWorkflowService['getSummaryObservable']>
  ): ReturnType<QueueWorkflowService['getSummaryObservable']> {
    return this.workflow.getSummaryObservable(...args);
  }

  getSummaryStream(
    ...args: Parameters<QueueWorkflowService['getSummaryStream']>
  ): ReturnType<QueueWorkflowService['getSummaryStream']> {
    return this.workflow.getSummaryStream(...args);
  }

  enqueueSummary(
    ...args: Parameters<QueueWorkflowService['enqueueSummary']>
  ): ReturnType<QueueWorkflowService['enqueueSummary']> {
    return this.workflow.enqueueSummary(...args);
  }

  cancelSummary(
    ...args: Parameters<QueueWorkflowService['cancelSummary']>
  ): ReturnType<QueueWorkflowService['cancelSummary']> {
    return this.workflow.cancelSummary(...args);
  }

  enqueueLightResearch(
    ...args: Parameters<QueueWorkflowService['enqueueLightResearch']>
  ): ReturnType<QueueWorkflowService['enqueueLightResearch']> {
    return this.workflow.enqueueLightResearch(...args);
  }

  getLightResearchStream(
    ...args: Parameters<QueueWorkflowService['getLightResearchStream']>
  ): ReturnType<QueueWorkflowService['getLightResearchStream']> {
    return this.workflow.getLightResearchStream(...args);
  }

  cancelLightResearch(
    ...args: Parameters<QueueWorkflowService['cancelLightResearch']>
  ): ReturnType<QueueWorkflowService['cancelLightResearch']> {
    return this.workflow.cancelLightResearch(...args);
  }

  enqueueDeepResearch(
    ...args: Parameters<QueueWorkflowService['enqueueDeepResearch']>
  ): ReturnType<QueueWorkflowService['enqueueDeepResearch']> {
    return this.workflow.enqueueDeepResearch(...args);
  }

  enqueueWriteAssist(
    ...args: Parameters<QueueWorkflowService['enqueueWriteAssist']>
  ): ReturnType<QueueWorkflowService['enqueueWriteAssist']> {
    return this.workflow.enqueueWriteAssist(...args);
  }

  enqueueDocWriteAssist(
    ...args: Parameters<QueueWorkflowService['enqueueDocWriteAssist']>
  ): ReturnType<QueueWorkflowService['enqueueDocWriteAssist']> {
    return this.workflow.enqueueDocWriteAssist(...args);
  }

  getWriteAssistStream(
    ...args: Parameters<QueueWorkflowService['getWriteAssistStream']>
  ): ReturnType<QueueWorkflowService['getWriteAssistStream']> {
    return this.workflow.getWriteAssistStream(...args);
  }

  cancelWriteAssist(
    ...args: Parameters<QueueWorkflowService['cancelWriteAssist']>
  ): ReturnType<QueueWorkflowService['cancelWriteAssist']> {
    return this.workflow.cancelWriteAssist(...args);
  }

  enqueueCompanyProfile(
    ...args: Parameters<QueueWorkflowService['enqueueCompanyProfile']>
  ): ReturnType<QueueWorkflowService['enqueueCompanyProfile']> {
    return this.workflow.enqueueCompanyProfile(...args);
  }

  getCompanyProfileStream(
    ...args: Parameters<QueueWorkflowService['getCompanyProfileStream']>
  ): ReturnType<QueueWorkflowService['getCompanyProfileStream']> {
    return this.workflow.getCompanyProfileStream(...args);
  }

  cancelCompanyProfile(
    ...args: Parameters<QueueWorkflowService['cancelCompanyProfile']>
  ): ReturnType<QueueWorkflowService['cancelCompanyProfile']> {
    return this.workflow.cancelCompanyProfile(...args);
  }

  enqueueCompanyAnalysis(
    ...args: Parameters<QueueWorkflowService['enqueueCompanyAnalysis']>
  ): ReturnType<QueueWorkflowService['enqueueCompanyAnalysis']> {
    return this.workflow.enqueueCompanyAnalysis(...args);
  }

  getCompanyAnalysisStream(
    ...args: Parameters<QueueWorkflowService['getCompanyAnalysisStream']>
  ): ReturnType<QueueWorkflowService['getCompanyAnalysisStream']> {
    return this.workflow.getCompanyAnalysisStream(...args);
  }

  cancelCompanyAnalysis(
    ...args: Parameters<QueueWorkflowService['cancelCompanyAnalysis']>
  ): ReturnType<QueueWorkflowService['cancelCompanyAnalysis']> {
    return this.workflow.cancelCompanyAnalysis(...args);
  }

  enqueueRoadmapAnalysis(
    ...args: Parameters<QueueWorkflowService['enqueueRoadmapAnalysis']>
  ): ReturnType<QueueWorkflowService['enqueueRoadmapAnalysis']> {
    return this.workflow.enqueueRoadmapAnalysis(...args);
  }

  getRoadmapAnalysisStream(
    ...args: Parameters<QueueWorkflowService['getRoadmapAnalysisStream']>
  ): ReturnType<QueueWorkflowService['getRoadmapAnalysisStream']> {
    return this.workflow.getRoadmapAnalysisStream(...args);
  }

  cancelRoadmapAnalysis(
    ...args: Parameters<QueueWorkflowService['cancelRoadmapAnalysis']>
  ): ReturnType<QueueWorkflowService['cancelRoadmapAnalysis']> {
    return this.workflow.cancelRoadmapAnalysis(...args);
  }

  enqueueBulkFetchNews(
    ...args: Parameters<QueueWorkflowService['enqueueBulkFetchNews']>
  ): ReturnType<QueueWorkflowService['enqueueBulkFetchNews']> {
    return this.workflow.enqueueBulkFetchNews(...args);
  }

  getBulkFetchNewsStream(
    ...args: Parameters<QueueWorkflowService['getBulkFetchNewsStream']>
  ): ReturnType<QueueWorkflowService['getBulkFetchNewsStream']> {
    return this.workflow.getBulkFetchNewsStream(...args);
  }

  cancelBulkFetchNews(
    ...args: Parameters<QueueWorkflowService['cancelBulkFetchNews']>
  ): ReturnType<QueueWorkflowService['cancelBulkFetchNews']> {
    return this.workflow.cancelBulkFetchNews(...args);
  }

  enqueueTechBlogTrend(
    ...args: Parameters<QueueWorkflowService['enqueueTechBlogTrend']>
  ): ReturnType<QueueWorkflowService['enqueueTechBlogTrend']> {
    return this.workflow.enqueueTechBlogTrend(...args);
  }

  getTechBlogTrendStream(
    ...args: Parameters<QueueWorkflowService['getTechBlogTrendStream']>
  ): ReturnType<QueueWorkflowService['getTechBlogTrendStream']> {
    return this.workflow.getTechBlogTrendStream(...args);
  }

  cancelTechBlogTrend(
    ...args: Parameters<QueueWorkflowService['cancelTechBlogTrend']>
  ): ReturnType<QueueWorkflowService['cancelTechBlogTrend']> {
    return this.workflow.cancelTechBlogTrend(...args);
  }

  enqueuePaperSummary(
    ...args: Parameters<QueueWorkflowService['enqueuePaperSummary']>
  ): ReturnType<QueueWorkflowService['enqueuePaperSummary']> {
    return this.workflow.enqueuePaperSummary(...args);
  }

  getPaperSummaryStream(
    ...args: Parameters<QueueWorkflowService['getPaperSummaryStream']>
  ): ReturnType<QueueWorkflowService['getPaperSummaryStream']> {
    return this.workflow.getPaperSummaryStream(...args);
  }

  cancelPaperSummary(
    ...args: Parameters<QueueWorkflowService['cancelPaperSummary']>
  ): ReturnType<QueueWorkflowService['cancelPaperSummary']> {
    return this.workflow.cancelPaperSummary(...args);
  }

  enqueuePaperTrend(
    ...args: Parameters<QueueWorkflowService['enqueuePaperTrend']>
  ): ReturnType<QueueWorkflowService['enqueuePaperTrend']> {
    return this.workflow.enqueuePaperTrend(...args);
  }

  getPaperTrendStream(
    ...args: Parameters<QueueWorkflowService['getPaperTrendStream']>
  ): ReturnType<QueueWorkflowService['getPaperTrendStream']> {
    return this.workflow.getPaperTrendStream(...args);
  }

  cancelPaperTrend(
    ...args: Parameters<QueueWorkflowService['cancelPaperTrend']>
  ): ReturnType<QueueWorkflowService['cancelPaperTrend']> {
    return this.workflow.cancelPaperTrend(...args);
  }

  enqueueNewsArticleSummary(
    ...args: Parameters<QueueWorkflowService['enqueueNewsArticleSummary']>
  ): ReturnType<QueueWorkflowService['enqueueNewsArticleSummary']> {
    return this.workflow.enqueueNewsArticleSummary(...args);
  }

  getNewsArticleSummaryStream(
    ...args: Parameters<QueueWorkflowService['getNewsArticleSummaryStream']>
  ): ReturnType<QueueWorkflowService['getNewsArticleSummaryStream']> {
    return this.workflow.getNewsArticleSummaryStream(...args);
  }

  cancelNewsArticleSummary(
    ...args: Parameters<QueueWorkflowService['cancelNewsArticleSummary']>
  ): ReturnType<QueueWorkflowService['cancelNewsArticleSummary']> {
    return this.workflow.cancelNewsArticleSummary(...args);
  }

  enqueueResumeCoverLetterCategories(
    ...args: Parameters<
      QueueWorkflowService['enqueueResumeCoverLetterCategories']
    >
  ): ReturnType<QueueWorkflowService['enqueueResumeCoverLetterCategories']> {
    return this.workflow.enqueueResumeCoverLetterCategories(...args);
  }

  getResumeCoverLetterCategoryStream(
    ...args: Parameters<
      QueueWorkflowService['getResumeCoverLetterCategoryStream']
    >
  ): ReturnType<QueueWorkflowService['getResumeCoverLetterCategoryStream']> {
    return this.workflow.getResumeCoverLetterCategoryStream(...args);
  }

  cancelResumeCoverLetterCategories(
    ...args: Parameters<
      QueueWorkflowService['cancelResumeCoverLetterCategories']
    >
  ): ReturnType<QueueWorkflowService['cancelResumeCoverLetterCategories']> {
    return this.workflow.cancelResumeCoverLetterCategories(...args);
  }

  enqueueResumeCoverLetterRefinedTitle(
    ...args: Parameters<
      QueueWorkflowService['enqueueResumeCoverLetterRefinedTitle']
    >
  ): ReturnType<QueueWorkflowService['enqueueResumeCoverLetterRefinedTitle']> {
    return this.workflow.enqueueResumeCoverLetterRefinedTitle(...args);
  }

  getResumeCoverLetterRefinedTitleStream(
    ...args: Parameters<
      QueueWorkflowService['getResumeCoverLetterRefinedTitleStream']
    >
  ): ReturnType<
    QueueWorkflowService['getResumeCoverLetterRefinedTitleStream']
  > {
    return this.workflow.getResumeCoverLetterRefinedTitleStream(...args);
  }

  cancelResumeCoverLetterRefinedTitle(
    ...args: Parameters<
      QueueWorkflowService['cancelResumeCoverLetterRefinedTitle']
    >
  ): ReturnType<QueueWorkflowService['cancelResumeCoverLetterRefinedTitle']> {
    return this.workflow.cancelResumeCoverLetterRefinedTitle(...args);
  }

  enqueueDocParseAsk(
    ...args: Parameters<QueueWorkflowService['enqueueDocParseAsk']>
  ): ReturnType<QueueWorkflowService['enqueueDocParseAsk']> {
    return this.workflow.enqueueDocParseAsk(...args);
  }

  enqueueDocParseAction(
    ...args: Parameters<QueueWorkflowService['enqueueDocParseAction']>
  ): ReturnType<QueueWorkflowService['enqueueDocParseAction']> {
    return this.workflow.enqueueDocParseAction(...args);
  }

  getDocParseStream(
    ...args: Parameters<QueueWorkflowService['getDocParseStream']>
  ): ReturnType<QueueWorkflowService['getDocParseStream']> {
    return this.workflow.getDocParseStream(...args);
  }

  cancelDocParse(
    ...args: Parameters<QueueWorkflowService['cancelDocParse']>
  ): ReturnType<QueueWorkflowService['cancelDocParse']> {
    return this.workflow.cancelDocParse(...args);
  }

  enqueueSpecAnalysis(
    ...args: Parameters<QueueWorkflowService['enqueueSpecAnalysis']>
  ): ReturnType<QueueWorkflowService['enqueueSpecAnalysis']> {
    return this.workflow.enqueueSpecAnalysis(...args);
  }

  getSpecAnalysisStream(
    ...args: Parameters<QueueWorkflowService['getSpecAnalysisStream']>
  ): ReturnType<QueueWorkflowService['getSpecAnalysisStream']> {
    return this.workflow.getSpecAnalysisStream(...args);
  }

  cancelSpecAnalysis(
    ...args: Parameters<QueueWorkflowService['cancelSpecAnalysis']>
  ): ReturnType<QueueWorkflowService['cancelSpecAnalysis']> {
    return this.workflow.cancelSpecAnalysis(...args);
  }

  enqueueImageOcr(
    ...args: Parameters<QueueWorkflowService['enqueueImageOcr']>
  ): ReturnType<QueueWorkflowService['enqueueImageOcr']> {
    return this.workflow.enqueueImageOcr(...args);
  }

  getImageOcrStream(
    ...args: Parameters<QueueWorkflowService['getImageOcrStream']>
  ): ReturnType<QueueWorkflowService['getImageOcrStream']> {
    return this.workflow.getImageOcrStream(...args);
  }

  cancelImageOcr(
    ...args: Parameters<QueueWorkflowService['cancelImageOcr']>
  ): ReturnType<QueueWorkflowService['cancelImageOcr']> {
    return this.workflow.cancelImageOcr(...args);
  }
}
