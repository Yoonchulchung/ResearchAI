import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { DocumentEntity } from '../domain/entity/document.entity';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly repo: Repository<DocumentEntity>,
  ) {}

  findAll(): Promise<DocumentEntity[]> {
    return this.repo.find({ order: { updatedAt: 'DESC' } });
  }

  findOne(id: string): Promise<DocumentEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async create(title: string, content: string): Promise<DocumentEntity> {
    const entity = this.repo.create({ id: randomUUID(), title, content });
    return this.repo.save(entity);
  }

  async update(id: string, title?: string, content?: string): Promise<DocumentEntity | null> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) return null;
    if (title !== undefined) entity.title = title;
    if (content !== undefined) entity.content = content;
    return this.repo.save(entity);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
