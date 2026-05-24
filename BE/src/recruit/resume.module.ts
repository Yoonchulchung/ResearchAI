import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResumeEntity } from './domain/resume/resume.entity';
import { ResumeService } from './application/resume/resume.service';
import { ResumeController } from './presentation/resume/resume.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ResumeEntity])],
  providers: [ResumeService],
  controllers: [ResumeController],
})
export class ResumeModule {}
