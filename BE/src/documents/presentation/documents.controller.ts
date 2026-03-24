import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { DocumentsService } from '../application/documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() body: { title: string; content: string; companyName?: string }) {
    return this.service.create(body.title, body.content, body.companyName);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { title?: string; content?: string; companyName?: string }) {
    return this.service.update(id, body.title, body.content, body.companyName);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
