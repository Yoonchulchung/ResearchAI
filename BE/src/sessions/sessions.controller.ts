import { Controller, Get, Post, Delete, Put, Param, Body } from '@nestjs/common';
import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  findAll() {
    return this.sessionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sessionsService.findOne(id);
  }

  @Post()
  create(@Body() body: { topic: string; model: string; tasks: any[] }) {
    return this.sessionsService.create(body.topic, body.model, body.tasks);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sessionsService.remove(id);
  }

  @Put(':id/tasks/:taskId')
  updateTask(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() body: { result: string; status: string },
  ) {
    return this.sessionsService.updateTask(id, parseInt(taskId), body.result, body.status);
  }
}
