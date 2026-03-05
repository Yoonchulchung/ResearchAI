import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Session } from '../domain/session.model';

@Injectable()
export class SessionRepository implements OnModuleInit {
  private readonly dataDir = path.join(__dirname, '../../../data/sessions');

  onModuleInit() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.migrateLegacy();
  }

  private migrateLegacy() {
    const legacyPath = path.join(this.dataDir, '../sessions.json');
    if (!fs.existsSync(legacyPath)) return;
    try {
      const { sessions } = JSON.parse(fs.readFileSync(legacyPath, 'utf-8')) as { sessions: Session[] };
      for (const s of sessions) {
        const dir = this.sessionDir(s.id);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(s, null, 2), 'utf-8');
        }
      }
      fs.renameSync(legacyPath, legacyPath + '.migrated');
    } catch {}
  }

  sessionDir(id: string): string {
    return path.join(this.dataDir, id);
  }

  read(id: string): Session {
    const filePath = path.join(this.sessionDir(id), 'session.json');
    if (!fs.existsSync(filePath)) throw new NotFoundException('Session not found');
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Session;
  }

  write(session: Session): void {
    const dir = this.sessionDir(session.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify(session, null, 2), 'utf-8');
  }

  listIds(): string[] {
    if (!fs.existsSync(this.dataDir)) return [];
    return fs.readdirSync(this.dataDir).filter((name) =>
      fs.statSync(path.join(this.dataDir, name)).isDirectory(),
    );
  }

  deleteDir(id: string): void {
    const dir = this.sessionDir(id);
    if (!fs.existsSync(dir)) throw new NotFoundException('Session not found');
    fs.rmSync(dir, { recursive: true, force: true });
  }

  chatPath(sessionId: string): string {
    return path.join(this.sessionDir(sessionId), 'chat.json');
  }
}
