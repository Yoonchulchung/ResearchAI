import { Controller, Get } from '@nestjs/common';
import { QueueService } from '../application/queue.service';
import { QueueStatusDto } from './dto/response/queue-status.dto';

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Get('status')
  getQueueStatus(): QueueStatusDto {
    return this.queueService.getStatus();
  }
}
