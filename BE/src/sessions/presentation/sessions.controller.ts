import { Controller, Get, Post, Delete, Put, Param, Body } from '@nestjs/common';
import { SessionsService } from '../application/sessions.service';
import { ResearchState } from '../domain/entity/session.entity';
import { CreateSessionDto } from './dto/request/create-session.dto';
import { UpdateTaskDto } from './dto/request/update-task.dto';
import { requestContext } from '../../shared/request-context';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  // ******* //
  // 새션 조회 //
  // ******* //
  @Get()
  findAll() {
    const userId = requestContext.getStore()?.id ?? null;
    return this.sessionsService.findAll(userId);
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
    const userId = requestContext.getStore()?.id ?? null;
    return this.sessionsService.createSession(body.topic, body.researchCloudAIModel, body.researchLocalAIModel, body.researchWebModel, body.tasks, userId);
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
  async updateTask(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateTaskDto,
  ) {
    await this.sessionsService.updateSessionItem(id, itemId, body.aiResult, body.webResult ?? '', body.status as ResearchState);
    return this.sessionsService.updateSession(id, body.status as ResearchState);
  }
  
  // ***************** //
  // 첨부 파일 ID 관리    //
  // ***************** //
  @Put(':id/attached-files')
  setAttachedFileIds(@Param('id') id: string, @Body() body: { fileIds: string[] }) {
    return this.sessionsService.setAttachedFileIds(id, body.fileIds);
  }

  @Get(':id/attached-files')
  getAttachedFileIds(@Param('id') id: string) {
    return this.sessionsService.getAttachedFileIds(id);
  }

  // ************ //
  // 새션 서머리 요청 //
  // ************ //
  @Get(':id/summary')
  getSummary(@Param('id') id: string) {
    return this.sessionsService.getSummary(id);
  }
}
