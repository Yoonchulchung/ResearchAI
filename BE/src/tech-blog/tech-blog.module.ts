import { Module } from '@nestjs/common';
import { TechBlogService } from './application/tech-blog.service';
import { TechBlogController } from './presentation/tech-blog.controller';

@Module({
  controllers: [TechBlogController],
  providers: [TechBlogService],
})
export class TechBlogModule {}
