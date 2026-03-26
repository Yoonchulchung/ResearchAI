import {
  Controller, Get, Post, Delete, Param,
  UploadedFile, UseInterceptors, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { BackgroundsService, BACKGROUNDS_DIR } from './backgrounds.service';
import type { BgImageInfo } from './backgrounds.service';

@Controller('backgrounds')
export class BackgroundsController {
  constructor(private readonly svc: BackgroundsService) {}

  @Get()
  list(): BgImageInfo[] {
    return this.svc.list();
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: BACKGROUNDS_DIR,
        filename: (_req, file, cb) => {
          // service로 접근할 수 없으므로 inline으로 생성
          const id = crypto.randomUUID();
          const ext = file.originalname.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? '.jpg';
          cb(null, `${id}${ext}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new BadRequestException('이미지 파일만 업로드 가능합니다.'), false);
      },
    }),
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upload(@UploadedFile() file: any): BgImageInfo {
    if (!file) throw new BadRequestException('파일이 없습니다.');
    const id = file.filename.replace(/\.[^.]+$/, '');
    return { id, filename: file.filename, url: `/backgrounds/${file.filename}` };
  }

  @Delete(':id')
  delete(@Param('id') id: string): { deleted: boolean } {
    this.svc.delete(id);
    return { deleted: true };
  }
}
