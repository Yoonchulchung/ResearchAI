import { Controller, Get, Post, Delete, Put, Param, Body, Res } from '@nestjs/common';
import { SessionsService } from '../application/sessions.service';
import { ResearchState } from '../domain/entity/session.entity';
import { CreateSessionDto } from './dto/request/create-session.dto';
import { UpdateTaskDto } from './dto/request/update-task.dto';
import { requestContext } from '../../shared/request-context';
import { ResearchRecruitRepository } from '../../research/domain/repository/research-recruit.repository';
import { RecruitContextService } from '../../recruit/application/recruit-context.service';
import { randomUUID } from 'crypto';

@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly recruitRepository: ResearchRecruitRepository,
    private readonly recruitContext: RecruitContextService,
  ) {}

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
    return this.sessionsService.createSession(
      body.topic, body.researchCloudAIModel, body.researchLocalAIModel, body.researchWebModel,
      body.tasks, userId, body.sessionType, body.lightResearchId,
    );
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

  // ************** //
  // 채용 공고 (recruit 세션 전용) //
  // ************** //

  /** 세션에 연결된 채용 공고 목록 조회 */
  @Get(':id/jobs')
  async getJobs(@Param('id') id: string) {
    const session = await this.sessionsService.findOne(id);
    if (!session?.lightResearchId) return [];
    const recruits = await this.recruitRepository.findByLightResearchId(session.lightResearchId);
    return recruits.map((r) => ({
      id: r.id,
      title: r.topic,
      company: r.detail,
      location: r.location,
      description: r.description,
      skills: r.skills ? r.skills.split(',').map((s) => s.trim()).filter(Boolean) : [],
      url: r.url,
      postedAt: r.recruitCreatedAt,
      source: r.url ? this.detectSource(r.url) : 'unknown',
    }));
  }

  /** 키워드로 추가 채용 공고 검색 (SSE 스트림) */
  @Post(':id/jobs/search')
  async searchMoreJobs(
    @Param('id') id: string,
    @Body() body: { keyword: string },
    @Res() res: any,
  ) {
    const session = await this.sessionsService.findOne(id);
    const lightResearchId = session?.lightResearchId;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const newJobs: { title: string; company: string; location?: string | null; description?: string | null; skills: string[]; url: string }[] = [];

    for await (const event of this.recruitContext.liveSearch({ keyword: body.keyword })) {
      if (event.type === 'log') {
        send({ type: 'log', message: event.message });
      } else if (event.type === 'jobs') {
        newJobs.push(...event.jobs);
        send({ type: 'jobs', jobs: event.jobs });

        if (lightResearchId) {
          Promise.all(
            event.jobs.map((job) =>
              this.recruitRepository.save({
                id: randomUUID(),
                lightResearchId,
                topic: job.title ?? null,
                detail: job.company ?? null,
                location: job.location ?? null,
                description: job.description ?? null,
                skills: job.skills?.join(', ') ?? null,
                url: job.url ?? null,
                recruitCreatedAt: new Date().toISOString(),
              }),
            ),
          ).catch(() => {});
        }
      }
    }

    send({ type: 'done', count: newJobs.length });
    res.end();
  }

  private detectSource(url: string): string {
    if (url.includes('linkareer')) return 'linkareer';
    if (url.includes('wanted')) return 'wanted';
    if (url.includes('jobplanet')) return 'jobplanet';
    if (url.includes('incruit')) return 'incruit';
    return 'other';
  }
}
