import { Injectable } from '@nestjs/common';
import { LightResearchPipelineService, JobItem, LightResearchEvent } from './pipeline/light-research-pipeline.service';
import { DeepResearchPipelineService, DeepResearchResult } from './pipeline/deep-research-pipeline.service';
import { SearchModeInput } from './search-planner.service';
import { SearchEngine, SearchPlan, PlannerMode } from '../domain/model/search-planner.model';
import { LightResearchEventType } from '../domain/model/light-research.model';

export interface LightResearchInput {
  type: 'light';
  topic: string;
  localAIModel: string;
  cloudAIModel: string;
  webModel: SearchEngine;
  searchMode: SearchModeInput;
  searchId: string;
  onEvent: (event: LightResearchEvent) => void;
}

export interface DeepResearchInput {
  type: 'deep';
  itemPrompt: string;
  cloudAIModel: string;
  webModel: SearchEngine;
}

@Injectable()
export class ResearchService {
  constructor(
    private readonly lightPipeline: LightResearchPipelineService,
    private readonly deepPipeline: DeepResearchPipelineService,
  ) {}

  async research(input: LightResearchInput): Promise<{ tasks: any[] }>;
  async research(input: DeepResearchInput): Promise<DeepResearchResult>;
  async research(input: LightResearchInput | DeepResearchInput): Promise<{ tasks: any[] } | DeepResearchResult> {
    if (input.type === 'light') {
      return this.lightPipeline.run(
        input.topic,
        input.localAIModel,
        input.cloudAIModel,
        input.webModel,
        input.searchMode,
        input.searchId,
        input.onEvent,
      );
    }
    return this.deepPipeline.run(input.itemPrompt, input.cloudAIModel, input.webModel);
  }

  async testGenerateTasks(
    topic: string,
    model: string,
    opts?: { customPrompt?: string; customSystem?: string; searchMode?: SearchModeInput },
  ) {
    return this.lightPipeline.testRun(topic, model, opts);
  }

  async testStep0Plan(topic: string, localAIModel: string, searchMode?: SearchModeInput) {
    const logs: string[] = [];
    const gen = this.lightPipeline.step0Plan(topic, localAIModel, searchMode ?? PlannerMode.AUTO);
    let result = await gen.next();
    while (!result.done) {
      const event = result.value as LightResearchEvent;
      if (event.type === LightResearchEventType.LOG) logs.push(event.message);
      result = await gen.next();
    }
    return { logs, searchPlan: result.value };
  }

  async testStep1aWebSearch(keyword: string, webModel: SearchEngine = SearchEngine.TAVILY) {
    const logs: string[] = [];
    const gen = this.lightPipeline.step1aWebSearch(keyword, webModel);
    let result = await gen.next();
    while (!result.done) {
      const event = result.value as LightResearchEvent;
      if (event.type === LightResearchEventType.LOG) logs.push(event.message);
      result = await gen.next();
    }
    return { logs, webContext: result.value };
  }

  async testStep1bRecruitSearch(keyword: string, companyTypes?: string[], jobTypes?: string[]) {
    const logs: string[] = [];
    const jobs: JobItem[] = [];
    const gen = this.lightPipeline.step1bRecruitSearch(companyTypes, jobTypes, keyword);
    let result = await gen.next();
    while (!result.done) {
      const event = result.value as LightResearchEvent;
      if (event.type === LightResearchEventType.LOG) logs.push(event.message);
      else if (event.type === LightResearchEventType.JOBS) jobs.push(...event.jobs);
      result = await gen.next();
    }
    return { logs, jobs, recruitCtx: result.value };
  }

  async testStep2GenerateTasks(topic: string, model: string, searchPlan: SearchPlan, webContext?: string, recruitCtx?: string) {
    const logs: string[] = [];
    let tasks: any[] = [];
    for await (const event of this.lightPipeline.step2GenerateTasks(topic, model, searchPlan, webContext, recruitCtx)) {
      if (event.type === LightResearchEventType.LOG) logs.push(event.message);
      else if (event.type === LightResearchEventType.DONE) tasks = event.tasks;
    }
    return { logs, tasks };
  }
}
