import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GmailTokenEntity } from './domain/entity/gmail-token.entity';
import { GmailService } from './application/gmail.service';
import { GmailController } from './presentation/gmail.controller';

@Module({
  imports: [TypeOrmModule.forFeature([GmailTokenEntity])],
  controllers: [GmailController],
  providers: [GmailService],
})
export class GmailModule {}
