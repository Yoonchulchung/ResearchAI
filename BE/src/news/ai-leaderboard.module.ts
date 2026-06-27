import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiLeaderboardEntryEntity } from 'src/news/domain/ai-leaderboard/entity/ai-leaderboard-entry.entity';
import { AiLeaderboardService } from 'src/news/application/ai-leaderboard/ai-leaderboard.service';
import { AiLeaderboardQueryService } from 'src/news/application/ai-leaderboard/query/ai-leaderboard-query.service';
import { AiLeaderboardRefreshService } from 'src/news/application/ai-leaderboard/collect/ai-leaderboard-refresh.service';
import { AiLeaderboardEntryMapper } from 'src/news/application/ai-leaderboard/query/ai-leaderboard-entry.mapper';
import { AiLeaderboardSourceService } from 'src/news/application/ai-leaderboard/collect/ai-leaderboard-source.service';
import { AiLeaderboardScoreService } from 'src/news/application/ai-leaderboard/score/ai-leaderboard-score.service';
import { AiLeaderboardStoreService } from 'src/news/application/ai-leaderboard/store/ai-leaderboard-store.service';
import { AiLeaderboardPopularityService } from 'src/news/application/ai-leaderboard/score/ai-leaderboard-popularity.service';
import { AiLeaderboardMediaService } from 'src/news/application/ai-leaderboard/score/ai-leaderboard-media.service';
import { AiLeaderboardController } from 'src/news/presentation/ai-leaderboard/ai-leaderboard.controller';
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
