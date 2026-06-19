import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiLeaderboardEntryEntity } from 'src/news/ai-leaderboard/domain/entity/ai-leaderboard-entry.entity';
import { AiLeaderboardService } from 'src/news/ai-leaderboard/application/ai-leaderboard.service';
import { AiLeaderboardController } from 'src/news/ai-leaderboard/presentation/ai-leaderboard.controller';
import { UserEntity } from 'src/auth/domain/entity/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AiLeaderboardEntryEntity, UserEntity])],
  controllers: [AiLeaderboardController],
  providers: [AiLeaderboardService],
  exports: [AiLeaderboardService],
})
export class AiLeaderboardModule {}
