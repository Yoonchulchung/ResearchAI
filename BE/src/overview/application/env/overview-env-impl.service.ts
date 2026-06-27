import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { LIGHT_RESEARCH_PROMPTS } from 'src/research/domain/prompt/research.prompts';
import { isEnvKeySet } from 'src/shared/env/env.utils';

const ALLOWED_KEYS = [
  'ANTHROPIC_ADMIN_API_KEY',
  'GOOGLE_API_KEY',
  'TAVILY_API_KEY',
  'SERPER_API_KEY',
  'NAVER_CLIENT_ID',
  'BRAVE_API_KEY',
  'DEFAULT_GROQ_API_KEY',
] as const;

export type AllowedKey = (typeof ALLOWED_KEYS)[number];

const KEY_LABELS: Record<AllowedKey, string> = {
  ANTHROPIC_ADMIN_API_KEY: 'Anthropic Admin',
  GOOGLE_API_KEY: 'Google (Default)',
  TAVILY_API_KEY: 'Tavily',
  SERPER_API_KEY: 'Serper',
  NAVER_CLIENT_ID: 'Naver',
  BRAVE_API_KEY: 'Brave',
  DEFAULT_GROQ_API_KEY: 'Groq (Default)',
};

@Injectable()
export class OverviewEnvImplService {
  private readonly envPath = path.resolve(process.cwd(), '.env');

  private maskKey(value: string | undefined): string | null {
    if (!value || !isEnvKeySet(value)) return null;
    if (value.length <= 8) return value.slice(0, 2) + '****';
    return (
      value.slice(0, 10) +
      '*'.repeat(Math.min(value.length - 10, 20)) +
      value.slice(-4)
    );
  }

  getApiKeys() {
    return ALLOWED_KEYS.map((key) => ({
      key,
      label: KEY_LABELS[key],
      masked: this.maskKey(process.env[key]),
      configured: isEnvKeySet(process.env[key]),
    }));
  }

  updateApiKey(key: string, value: string): { ok: boolean } {
    if (!(ALLOWED_KEYS as readonly string[]).includes(key)) {
      throw new BadRequestException('허용되지 않은 키입니다.');
    }

    let content = '';
    try {
      content = fs.readFileSync(this.envPath, 'utf-8');
    } catch {
      // .env 없으면 새로 생성
    }

    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content = content.trimEnd() + `\n${key}=${value}\n`;
    }

    fs.writeFileSync(this.envPath, content, 'utf-8');
    process.env[key] = value;

    return { ok: true };
  }

  getPromptTemplates() {
    return {
      lightResearchCloud: LIGHT_RESEARCH_PROMPTS.taskList(
        '{{topic}}',
        '{{searchContext}}',
      ),
      system: LIGHT_RESEARCH_PROMPTS.system,
      ollamaFilter: LIGHT_RESEARCH_PROMPTS.ollamaFilter(
        '{{query}}',
        '{{context}}',
      ),
    };
  }

  getPipelineStatus() {
    const isSet = isEnvKeySet;
    return {
      tavily: isSet(process.env.TAVILY_API_KEY),
      serper: isSet(process.env.SERPER_API_KEY),
      naver: isSet(process.env.NAVER_CLIENT_ID),
      brave: isSet(process.env.BRAVE_API_KEY),
      ollama: true,
    };
  }
}
