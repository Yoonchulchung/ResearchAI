import { Controller, Get, Post, Delete, Put, Param, Body } from '@nestjs/common';
import { SessionsService } from '../application/sessions.service';
import { ResearchState } from '../domain/entity/session.entity';
import { CreateSessionDto } from './dto/request/create-session.dto';
import { UpdateTaskDto } from './dto/request/update-task.dto';
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  // ******* //
  // 새션 조회 //
  // ******* //
  @Get()
  findAll() {
    return this.sessionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sessionsService.findOne(id);
  }

  // ******* //
  // 새션 생성 //
  // ******* //
  @Post()
  create(@Body() body: CreateSessionDto) {
    return this.sessionsService.createSession(body.topic, body.researchCloudAIModel, body.researchLocalAIModel, body.researchWebModel, body.tasks);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sessionsService.remove(id);
  }

  @Delete(':id/items/:itemId')
  removeItem(@Param('itemId') itemId: string) {
    return this.sessionsService.removeItem(itemId);
  }

  @Put(':id/items/:itemId')
  updateTask(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateTaskDto,
  ) {
    return this.sessionsService.updateSession(id, itemId, body.result, body.status as ResearchState);
  }
  
  // ************ //
  // 새션 서머리 요청 //
  // ************ //
  @Get(':id/summary')
  getSummary(@Param('id') id: string) {
    return this.sessionsService.getSummary(id);
  }
}
