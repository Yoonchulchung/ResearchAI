/**
 * 다양한 소스의 경력 구분 문자열을 "인턴" | "신입" | "경력" | "신입·경력" 으로 통일
 */
export function normalizeJobType(raw: string): string {
  if (!raw) return '';
  const normalized = raw.trim().toUpperCase();
  if (normalized === 'NEW') return '신입';
  if (normalized === 'EXPERIENCED') return '경력';
  if (normalized === 'CONTRACT') return '계약직';
  if (/인턴|intern/i.test(raw)) return '인턴';

  const hasShinip = /신입/.test(raw);
  const hasKyeolryeok = /경력/.test(raw);
  const hasContract = /계약/.test(raw);

  if (hasShinip && hasKyeolryeok) return '신입·경력';
  if (hasShinip) return '신입';
  if (hasKyeolryeok) return '경력';
  if (hasContract) return '계약직';

  return raw;
}
