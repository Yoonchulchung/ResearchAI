import { Module } from '@nestjs/common';
import { VectorService } from 'src/vector/vector.service';
import { VectorController } from 'src/vector/vector.controller';

@Module({
  controllers: [VectorController],
  providers: [VectorService],
  exports: [VectorService],
})
export class VectorModule {}
