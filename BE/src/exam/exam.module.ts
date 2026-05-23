import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentRefreshStateEntity } from '../shared/entity/content-refresh-state.entity';
import { ExamService } from './application/exam.service';
import { ExamEventEntity } from './domain/entity/exam-event.entity';
import { DataqExamProvider } from './infrastructure/dataq-exam.provider';
import { ExamController } from './presentation/exam.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ExamEventEntity, ContentRefreshStateEntity])],
  controllers: [ExamController],
  providers: [ExamService, DataqExamProvider],
})
export class ExamModule {}

