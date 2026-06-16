import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResearchModule } from '../research/research.module';
import { ResumeEntity } from './domain/resume/resume.entity';
import { ResumeCoverLetterEntity } from './domain/resume/resume-cover-letter.entity';
import { ResumeExperienceEntity } from './domain/resume/resume-experience.entity';
import { ResumePrizeEntity } from './domain/resume/resume-prize.entity';
import { ResumeTrainingEntity } from './domain/resume/resume-training.entity';
import { ResumeVersionEntity } from './domain/resume/resume-version.entity';
import { ResumeAiEvalEntity } from './domain/resume/resume-ai-eval.entity';
import { RecruitResumeCompanyJdEntity } from './domain/resume/recruit-resume-company-jd.entity';
import { RecruitCompanyNewsEntity } from './domain/company-news/recruit-company-news.entity';
import { ResumeService } from './application/resume/resume.service';
import { ResumeController } from './presentation/resume/resume.controller';

@Module({
  imports: [
    forwardRef(() => ResearchModule),
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
    ]),
  ],
  providers: [ResumeService],
  controllers: [ResumeController],
  exports: [ResumeService],
})
export class ResumeModule {}
