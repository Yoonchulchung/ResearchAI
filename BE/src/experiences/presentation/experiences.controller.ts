import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ExperiencesService } from '../application/experiences.service';
import { CreateExperienceDto, SearchExperiencesDto, UpdateExperienceDto } from './dto/experience.dto';

@Controller('experiences')
export class ExperiencesController {
  constructor(private readonly service: ExperiencesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreateExperienceDto) {
    return this.service.create(dto.title, dto.content, dto.category);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateExperienceDto) {
    return this.service.update(id, dto.title, dto.content, dto.category, dto.aiCategories);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }

  @Post('search')
  search(@Body() dto: SearchExperiencesDto) {
    return this.service.search(dto.query, dto.topK ?? 5);
  }

  @Post(':id/suggest-categories')
  suggestCategories(@Param('id') id: string, @Body() dto: { model: string }) {
    return this.service.suggestCategories(id, dto.model);
  }
}
