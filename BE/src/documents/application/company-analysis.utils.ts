const NEWS_SITE_PATTERNS = ['news', 'media', 'press', 'yna.co.kr', 'yonhap', 'kbs', 'mbc', 'sbs', 'jtbc', 'chosun', 'joongang', 'hani', 'khan', 'donga', 'heraldcorp', 'edaily', 'etnews', 'zdnet'];
const JOB_BOARD_PATTERNS = ['saramin', 'jobkorea', 'wanted', 'incruit', 'linkareer', 'catch.co', 'jumpit', 'rallit', 'programmers', 'rocketpunch', 'recruit', 'career', 'job', 'employ', 'hiring', '채용'];

/** 검색 엔진이 반환하는 "[제목]\n내용\n출처: url" 형식에서 링크를 추출 */
export function parseSearchLinks(text: string): { title: string; url: string }[] {
  if (!text) return [];
  const results: { title: string; url: string }[] = [];
  const re = /\[([^\]]+)\][\s\S]*?출처:\s*(https?:\/\/[^\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    results.push({ title: m[1].trim(), url: m[2].trim() });
  }
  return results;
}

export function isJobPosting(url: string, title: string): boolean {
  const combined = (url + ' ' + title).toLowerCase();
  return JOB_BOARD_PATTERNS.some((p) => combined.includes(p));
}

export function isNewsArticle(url: string): boolean {
  return NEWS_SITE_PATTERNS.some((p) => url.toLowerCase().includes(p));
}

export function isNaverBlog(url: string): boolean {
  return url.toLowerCase().includes('blog.naver.com');
}

/** AI가 JSON 문자열 내부에 줄바꿈·탭 등 제어문자를 그대로 출력할 때 이스케이프 복구 */
export function repairJsonStr(s: string): string {
  let result = '';
  let inString = false;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (!inString) {
      if (ch === '"') inString = true;
      result += ch;
    } else {
      if (ch === '\\') {
        result += ch;
        i++;
        if (i < s.length) result += s[i];
      } else if (ch === '"') {
        inString = false;
        result += ch;
      } else if (ch === '\n') {
        result += '\\n';
      } else if (ch === '\r') {
        result += '\\r';
      } else if (ch === '\t') {
        result += '\\t';
      } else {
        result += ch;
      }
    }
    i++;
  }
  return result;
}
