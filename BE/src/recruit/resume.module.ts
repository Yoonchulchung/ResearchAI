import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResearchModule } from 'src/research/research.module';
import { BrowseModule } from 'src/browse/browse.module';
import { NaverNewsApi } from 'src/news/infrastructure/provider/naver-news.api';
import { ResumeEntity } from 'src/recruit/domain/resume/resume.entity';
import { ResumeCoverLetterEntity } from 'src/recruit/domain/resume/resume-cover-letter.entity';
import { ResumeExperienceEntity } from 'src/recruit/domain/resume/resume-experience.entity';
import { ResumePrizeEntity } from 'src/recruit/domain/resume/resume-prize.entity';
import { ResumeTrainingEntity } from 'src/recruit/domain/resume/resume-training.entity';
import { ResumeVersionEntity } from 'src/recruit/domain/resume/resume-version.entity';
import { ResumeAiEvalEntity } from 'src/recruit/domain/resume/resume-ai-eval.entity';
import { RecruitResumeCompanyJdEntity } from 'src/recruit/domain/resume/recruit-resume-company-jd.entity';
import { RecruitCompanyNewsEntity } from 'src/recruit/domain/company-news/recruit-company-news.entity';
import { ResumeAttachmentEntity } from 'src/recruit/domain/resume/resume-attachment.entity';
import { ResumeService } from 'src/recruit/application/resume/resume.service';
import { ResumeCrudService } from 'src/recruit/application/resume/resume-crud.service';
import { ResumeVersionService } from 'src/recruit/application/resume/resume-version.service';
import { ResumePdfService } from 'src/recruit/application/resume/resume-pdf.service';
import { ResumeSearchService } from 'src/recruit/application/resume/resume-search.service';
import { ResumeCoverLetterService } from 'src/recruit/application/resume/resume-cover-letter.service';
import { ResumeEvalService } from 'src/recruit/application/resume/resume-eval.service';
import { ResumeCompanyNewsService } from 'src/recruit/application/resume/resume-company-news.service';
import { ResumeAttachmentService } from 'src/recruit/application/resume/resume-attachment.service';
import { ResumeController } from 'src/recruit/presentation/resume/resume.controller';

@Module({
  imports: [
    forwardRef(() => ResearchModule),
    BrowseModule,
    TypeOrmModule.forFeature([
      ResumeEntity,
      ResumeCoverLetterEntity,
      ResumeExperienceEntity,
      ResumePrizeEntity,
      ResumeTrainingEntity,
      ResumeVersionEntity,
      ResumeAiEvalEntity,
      RecruitResumeCompanyJdEntity,
      RecruitCompanyNewsEntity,
      ResumeAttachmentEntity,
    ]),
  ],
  providers: [
    ResumeCrudService,
    ResumeVersionService,
    ResumePdfService,
    ResumeSearchService,
    ResumeCoverLetterService,
    ResumeEvalService,
    ResumeCompanyNewsService,
    ResumeAttachmentService,
    ResumeService,
    NaverNewsApi,
  ],
  controllers: [ResumeController],
  exports: [ResumeService],
})
export class ResumeModule {}
