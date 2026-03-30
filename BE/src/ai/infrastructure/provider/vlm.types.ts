export interface ImageContentBlock {
  type: 'image';
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  data: string; // base64
}

/** 텍스트 또는 이미지 블록의 배열, 혹은 단순 문자열 */
export type VlmContent = string | Array<string | ImageContentBlock>;

export interface VlmMessage {
  role: 'user' | 'assistant';
  content: VlmContent;
}

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
