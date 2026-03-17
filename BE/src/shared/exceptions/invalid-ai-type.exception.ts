import { BadRequestException } from '@nestjs/common';

export class InvalidAiTypeException extends BadRequestException {
  constructor(model: string) {
    super(`지원하지 않는 AI 모델 타입입니다: ${model}`);
  }
}
