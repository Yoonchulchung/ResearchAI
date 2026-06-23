import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiLeaderboardEntryEntity } from 'src/news/ai-leaderboard/domain/entity/ai-leaderboard-entry.entity';
import { AiLeaderboardService } from 'src/news/ai-leaderboard/application/ai-leaderboard.service';
import { AiLeaderboardQueryService } from 'src/news/ai-leaderboard/application/ai-leaderboard-query.service';
import { AiLeaderboardRefreshService } from 'src/news/ai-leaderboard/application/ai-leaderboard-refresh.service';
import { AiLeaderboardEntryMapper } from 'src/news/ai-leaderboard/application/ai-leaderboard-entry.mapper';
import { AiLeaderboardSourceService } from 'src/news/ai-leaderboard/application/ai-leaderboard-source.service';
import { AiLeaderboardScoreService } from 'src/news/ai-leaderboard/application/ai-leaderboard-score.service';
import { AiLeaderboardStoreService } from 'src/news/ai-leaderboard/application/ai-leaderboard-store.service';
import { AiLeaderboardPopularityService } from 'src/news/ai-leaderboard/application/ai-leaderboard-popularity.service';
import { AiLeaderboardMediaService } from 'src/news/ai-leaderboard/application/ai-leaderboard-media.service';
import { AiLeaderboardController } from 'src/news/ai-leaderboard/presentation/ai-leaderboard.controller';
import { UserEntity } from 'src/auth/domain/entity/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AiLeaderboardEntryEntity, UserEntity])],
  controllers: [AiLeaderboardController],
  providers: [
    AiLeaderboardService,
    AiLeaderboardQueryService,
    AiLeaderboardRefreshService,
    AiLeaderboardEntryMapper,
    AiLeaderboardSourceService,
    AiLeaderboardScoreService,
    AiLeaderboardStoreService,
    AiLeaderboardPopularityService,
    AiLeaderboardMediaService,
  ],
  exports: [AiLeaderboardService],
})
export class AiLeaderboardModule {}
