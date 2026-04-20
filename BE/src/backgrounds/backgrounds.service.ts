import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, extname } from 'path';

export const BACKGROUNDS_BASE_DIR = join(process.cwd(), 'media', 'data', 'backgrounds');

export interface BgImageInfo {
  id: string;
  filename: string;
  url: string;
}

@Injectable()
export class BackgroundsService {
  constructor() {
    if (!existsSync(BACKGROUNDS_BASE_DIR)) {
      mkdirSync(BACKGROUNDS_BASE_DIR, { recursive: true });
    }
  }

  userDir(userId: string): string {
    const dir = join(BACKGROUNDS_BASE_DIR, userId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  list(userId: string): BgImageInfo[] {
    const dir = this.userDir(userId);
    return readdirSync(dir)
      .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f))
      .map((filename) => ({
        id: filename.replace(/\.[^.]+$/, ''),
        filename,
        url: `/backgrounds/${userId}/${filename}`,
      }));
  }

  delete(id: string, userId: string): void {
    const dir = this.userDir(userId);
    const files = readdirSync(dir).filter((f) => f.startsWith(id + '.') || f === id);
    if (files.length === 0) throw new NotFoundException(`배경 이미지를 찾을 수 없습니다: ${id}`);
    files.forEach((f) => unlinkSync(join(dir, f)));
  }

  makeFilename(originalname: string): string {
    const id = crypto.randomUUID();
    const ext = extname(originalname).toLowerCase() || '.jpg';
    return `${id}${ext}`;
  }
}
