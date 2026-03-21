import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExperienceEntity } from './domain/entity/experience.entity';
import { ExperiencesService } from './application/experiences.service';
import { ExperiencesController } from './presentation/experiences.controller';
import { VectorModule } from '../vector/vector.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [TypeOrmModule.forFeature([ExperienceEntity]), VectorModule, AiModule],
  controllers: [ExperiencesController],
  providers: [ExperiencesService],
})
export class ExperiencesModule {}
