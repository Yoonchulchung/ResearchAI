import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionEntity } from '../sessions/domain/entity/session.entity';
import { SessionItemEntity } from '../sessions/domain/entity/session-item.enityt';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'data/sessions.db',
      entities: [SessionEntity, SessionItemEntity],
      synchronize: true,
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
