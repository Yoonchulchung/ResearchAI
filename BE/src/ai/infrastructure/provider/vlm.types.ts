export type {
  ImageContentBlock,
  VlmContent,
  VlmMessage,
} from 'src/ai/application/ai-provider.types';
import type { VlmContent } from 'src/ai/application/ai-provider.types';

/** VlmContent → 텍스트만 추출 (이미지 미지원 폴백용) */
export function extractText(content: VlmContent): string {
  if (typeof content === 'string') return content;
  return content.filter((c): c is string => typeof c === 'string').join('\n');
}

/** VlmContent에 이미지가 포함되어 있는지 확인 */
export function hasImage(content: VlmContent): boolean {
  if (typeof content === 'string') return false;
  return content.some((c) => typeof c !== 'string' && c.type === 'image');
}
