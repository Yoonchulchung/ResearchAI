import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentRefreshStateEntity } from 'src/shared/entity/content-refresh-state.entity';
import { ExamService } from 'src/recruit/application/exam/exam.service';
import { ExamEventEntity } from 'src/recruit/domain/exam/entity/exam-event.entity';
import { DataqExamProvider } from 'src/recruit/infrastructure/exam/dataq-exam.provider';
import { ExamController } from 'src/recruit/presentation/exam/exam.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExamEventEntity, ContentRefreshStateEntity]),
  ],
  controllers: [ExamController],
  providers: [ExamService, DataqExamProvider],
})
export class ExamModule {}
