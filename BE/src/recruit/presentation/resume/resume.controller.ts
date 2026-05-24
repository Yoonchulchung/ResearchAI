import { Body, Controller, Get, Put } from '@nestjs/common';
import { ResumeService } from '../../application/resume/resume.service';

@Controller('resume')
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  @Get()
  async getResume() {
    return this.resumeService.getResume();
  }

  @Put()
  async saveResume(@Body() body: object) {
    return this.resumeService.saveResume(body);
  }
}
