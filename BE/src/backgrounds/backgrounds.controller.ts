import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { BackgroundsService } from 'src/backgrounds/backgrounds.service';
import type { BgImageInfo } from 'src/backgrounds/backgrounds.service';
import { requestContext } from 'src/shared/request-context';

@Controller('backgrounds')
export class BackgroundsController {
  constructor(private readonly svc: BackgroundsService) {}

  private getUserId(): string | null {
    return requestContext.getStore()?.id ?? null;
  }

  @Get()
  list(): BgImageInfo[] {
    const userId = this.getUserId();
    if (!userId) return [];
    return this.svc.list(userId);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const userId = requestContext.getStore()?.id;
          if (!userId)
            return cb(new BadRequestException('로그인이 필요합니다.'), '');
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { existsSync, mkdirSync } = require('fs');
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { join } = require('path');
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { BACKGROUNDS_BASE_DIR } = require('src/backgrounds/backgrounds.service');
          const dir = join(BACKGROUNDS_BASE_DIR, userId);
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const id = crypto.randomUUID();
          const ext =
            file.originalname.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? '.jpg';
          cb(null, `${id}${ext}`);
        },
      }),
      limits: { fileSize: 20 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else
          cb(
            new BadRequestException('이미지 파일만 업로드 가능합니다.'),
            false,
          );
      },
    }),
  )
  upload(@UploadedFile() file: any): BgImageInfo {
    const userId = this.getUserId();
    if (!userId) throw new BadRequestException('로그인이 필요합니다.');
    if (!file) throw new BadRequestException('파일이 없습니다.');
    const id = file.filename.replace(/\.[^.]+$/, '');
    return {
      id,
      filename: file.filename,
      url: `/backgrounds/${userId}/${file.filename}`,
    };
  }

  @Delete(':id')
  delete(@Param('id') id: string): { deleted: boolean } {
    const userId = this.getUserId();
    if (!userId) throw new BadRequestException('로그인이 필요합니다.');
    this.svc.delete(id, userId);
    return { deleted: true };
  }
}
