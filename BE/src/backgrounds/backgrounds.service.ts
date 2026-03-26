import { Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, extname } from 'path';

export const BACKGROUNDS_DIR = join(process.cwd(), 'media', 'data', 'backgrounds');

export interface BgImageInfo {
  id: string;
  filename: string;
  url: string;
}

@Injectable()
export class BackgroundsService {
  constructor() {
    if (!existsSync(BACKGROUNDS_DIR)) {
      mkdirSync(BACKGROUNDS_DIR, { recursive: true });
    }
  }

  list(): BgImageInfo[] {
    return readdirSync(BACKGROUNDS_DIR)
      .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f))
      .map((filename) => ({
        id: filename.replace(/\.[^.]+$/, ''),
        filename,
        url: `/backgrounds/${filename}`,
      }));
  }

  delete(id: string): void {
    const files = readdirSync(BACKGROUNDS_DIR).filter((f) =>
      f.startsWith(id + '.') || f === id,
    );
    if (files.length === 0) throw new NotFoundException(`배경 이미지를 찾을 수 없습니다: ${id}`);
    files.forEach((f) => unlinkSync(join(BACKGROUNDS_DIR, f)));
  }

  makeFilename(originalname: string): string {
    const id = crypto.randomUUID();
    const ext = extname(originalname).toLowerCase() || '.jpg';
    return `${id}${ext}`;
  }
}
