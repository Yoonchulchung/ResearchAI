import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiLeaderboardEntryEntity } from './domain/entity/ai-leaderboard-entry.entity';
import { AiLeaderboardService } from './application/ai-leaderboard.service';
import { AiLeaderboardController } from './presentation/ai-leaderboard.controller';
import { UserEntity } from '../../auth/domain/entity/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AiLeaderboardEntryEntity, UserEntity])],
  controllers: [AiLeaderboardController],
  providers: [AiLeaderboardService],
  exports: [AiLeaderboardService],
})
export class AiLeaderboardModule {}
