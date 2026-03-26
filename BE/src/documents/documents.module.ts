import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { DocumentEntity } from './domain/entity/document.entity';
import { ExperienceEntity } from './domain/entity/experience.entity';
import { DocumentsService } from './application/documents.service';
import { DocumentsController } from './presentation/documents.controller';
import { AiModule } from '../ai/ai.module';
import { VectorModule } from '../vector/vector.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity, ExperienceEntity]),
    MulterModule.register(),
    AiModule,
    VectorModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
