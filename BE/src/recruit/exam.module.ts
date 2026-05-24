import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentRefreshStateEntity } from '../shared/entity/content-refresh-state.entity';
import { ExamService } from './application/exam/exam.service';
import { ExamEventEntity } from './domain/exam/entity/exam-event.entity';
import { DataqExamProvider } from './infrastructure/exam/dataq-exam.provider';
import { ExamController } from './presentation/exam/exam.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ExamEventEntity, ContentRefreshStateEntity])],
  controllers: [ExamController],
  providers: [ExamService, DataqExamProvider],
})
export class ExamModule {}
