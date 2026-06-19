/**
 * Ollama tool calling에서 사용할 기본 Tool 정의 및 실행기.
 *
 * 사용 예:
 *   import { BASIC_TOOLS, executeOllamaTool } from 'src/ai/infrastructure/provider/ollama-tools';
 *
 *   const result = await callOllama(model, system, prompt, undefined, 30_000, BASIC_TOOLS);
 *   for (const tc of result.toolCalls) {
 *     const output = await executeOllamaTool(tc.function.name, tc.function.arguments);
 *     // output을 다음 메시지로 모델에 전달
 *   }
 */

import type { OllamaTool } from 'src/ai/infrastructure/provider/ollama.ai';

// ── Tool 정의 ──────────────────────────────────────────────────────────────────

export const TOOL_GET_CURRENT_TIME: OllamaTool = {
  type: 'function',
  function: {
    name: 'get_current_time',
    description:
      '현재 날짜와 시각을 반환합니다. 오늘이 몇 월 며칠인지, 현재 시간이 몇 시인지 알 때 사용합니다.',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description:
            'IANA 타임존 (예: "Asia/Seoul", "UTC"). 기본값은 Asia/Seoul.',
        },
        format: {
          type: 'string',
          description:
            '출력 형식: "datetime" | "date" | "time" | "iso". 기본값은 "datetime".',
          enum: ['datetime', 'date', 'time', 'iso'],
        },
      },
      required: [],
    },
  },
};

export const TOOL_SEARCH_WEB: OllamaTool = {
  type: 'function',
  function: {
    name: 'search_web',
    description:
      '웹 검색을 수행하고 관련 정보를 반환합니다. 최신 정보, 뉴스, 기술 문서, 회사 정보 등을 찾을 때 사용합니다.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '검색할 키워드 또는 문장',
        },
        max_results: {
          type: 'number',
          description: '반환할 최대 결과 수 (1-10). 기본값은 5.',
        },
      },
      required: ['query'],
    },
  },
};

export const TOOL_FETCH_URL: OllamaTool = {
  type: 'function',
  function: {
    name: 'fetch_url_content',
    description:
      '특정 URL의 웹 페이지 내용을 가져옵니다. 공식 문서, 블로그 글, 뉴스 기사 등 특정 페이지의 내용을 읽어야 할 때 사용합니다.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description:
            '내용을 가져올 URL (http:// 또는 https://로 시작해야 함)',
        },
        max_chars: {
          type: 'number',
          description: '반환할 최대 문자 수. 기본값은 3000.',
        },
      },
      required: ['url'],
    },
  },
};

export const TOOL_CALCULATE: OllamaTool = {
  type: 'function',
  function: {
    name: 'calculate',
    description:
      '수학 계산식을 계산합니다. 사칙연산, 거듭제곱, 나머지 연산, 괄호 등을 지원합니다.',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description:
            '계산할 수식 (예: "2 + 3 * 4", "(100 / 5) ** 2", "17 % 3")',
        },
      },
      required: ['expression'],
    },
  },
};

export const TOOL_CONVERT_UNIT: OllamaTool = {
  type: 'function',
  function: {
    name: 'convert_unit',
    description:
      '단위를 변환합니다. 길이, 무게, 온도, 화폐(환율 제외) 등의 변환에 사용합니다.',
    parameters: {
      type: 'object',
      properties: {
        value: {
          type: 'number',
          description: '변환할 값',
        },
        from_unit: {
          type: 'string',
          description: '원본 단위 (예: "km", "kg", "celsius", "inch", "lb")',
        },
        to_unit: {
          type: 'string',
          description: '목표 단위 (예: "m", "g", "fahrenheit", "cm", "kg")',
        },
      },
      required: ['value', 'from_unit', 'to_unit'],
    },
  },
};

/** 모든 기본 툴 묶음 */
export const BASIC_TOOLS: OllamaTool[] = [
  TOOL_GET_CURRENT_TIME,
  TOOL_SEARCH_WEB,
  TOOL_FETCH_URL,
  TOOL_CALCULATE,
  TOOL_CONVERT_UNIT,
];

/** 검색 없이 사용할 때의 최소 툴 묶음 */
export const MINIMAL_TOOLS: OllamaTool[] = [
  TOOL_GET_CURRENT_TIME,
  TOOL_CALCULATE,
  TOOL_CONVERT_UNIT,
];

// ── Tool 실행기 ────────────────────────────────────────────────────────────────

export interface ToolExecuteResult {
  success: boolean;
  output: string;
}

/**
 * Ollama가 요청한 tool call을 실제로 실행합니다.
 * 알 수 없는 도구나 오류 발생 시에도 예외를 던지지 않고 오류 메시지를 반환합니다.
 */
export async function executeOllamaTool(
  name: string,
  args: Record<string, any>,
): Promise<ToolExecuteResult> {
  try {
    switch (name) {
      case 'get_current_time':
        return { success: true, output: execGetCurrentTime(args) };
      case 'search_web':
        return { success: true, output: await execSearchWeb(args) };
      case 'fetch_url_content':
        return { success: true, output: await execFetchUrl(args) };
      case 'calculate':
        return { success: true, output: execCalculate(args) };
      case 'convert_unit':
        return { success: true, output: execConvertUnit(args) };
      default:
        return { success: false, output: `알 수 없는 도구: ${name}` };
    }
  } catch (err: any) {
    return {
      success: false,
      output: `도구 실행 오류 (${name}): ${err?.message ?? err}`,
    };
  }
}

// ── 개별 실행 함수 ─────────────────────────────────────────────────────────────

function execGetCurrentTime(args: Record<string, any>): string {
  const tz = (args.timezone as string | undefined) ?? 'Asia/Seoul';
  const fmt = (args.format as string | undefined) ?? 'datetime';
  const now = new Date();

  if (fmt === 'iso') return now.toISOString();

  const localeOpts: Intl.DateTimeFormatOptions = { timeZone: tz };
  if (fmt === 'datetime' || fmt === 'date') {
    localeOpts.year = 'numeric';
    localeOpts.month = '2-digit';
    localeOpts.day = '2-digit';
  }
  if (fmt === 'datetime' || fmt === 'time') {
    localeOpts.hour = '2-digit';
    localeOpts.minute = '2-digit';
    localeOpts.second = '2-digit';
    localeOpts.hour12 = false;
  }

  const formatted = new Intl.DateTimeFormat('ko-KR', localeOpts).format(now);
  return `현재 시각 (${tz}): ${formatted}`;
}

async function execSearchWeb(args: Record<string, any>): Promise<string> {
  const query = args.query as string;
  const max_results = (args.max_results as number | undefined) ?? 5;
  if (!query?.trim()) return '검색어가 없습니다.';

  const tavilyKey = process.env.TAVILY_API_KEY;
  const serperKey = process.env.SERPER_API_KEY;
  const braveKey = process.env.BRAVE_API_KEY;

  if (tavilyKey) return searchViaTavily(query, max_results, tavilyKey);
  if (serperKey) return searchViaSerper(query, max_results, serperKey);
  if (braveKey) return searchViaBrave(query, max_results, braveKey);

  return '웹 검색을 위한 API 키가 설정되지 않았습니다. (TAVILY_API_KEY / SERPER_API_KEY / BRAVE_API_KEY)';
}

async function searchViaTavily(
  query: string,
  maxResults: number,
  apiKey: string,
): Promise<string> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: 'basic',
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Tavily 오류: ${res.status}`);
  const data = (await res.json()) as {
    results: { title: string; url: string; content: string }[];
  };
  return data.results
    .slice(0, maxResults)
    .map((r) => `[${r.title}]\n${r.content.slice(0, 500)}\n출처: ${r.url}`)
    .join('\n\n');
}

async function searchViaSerper(
  query: string,
  maxResults: number,
  apiKey: string,
): Promise<string> {
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
    body: JSON.stringify({ q: query, num: maxResults }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Serper 오류: ${res.status}`);
  const data = (await res.json()) as {
    organic: { title: string; link: string; snippet: string }[];
  };
  return (data.organic ?? [])
    .slice(0, maxResults)
    .map((r) => `[${r.title}]\n${r.snippet}\n출처: ${r.link}`)
    .join('\n\n');
}

async function searchViaBrave(
  query: string,
  maxResults: number,
  apiKey: string,
): Promise<string> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Brave 오류: ${res.status}`);
  const data = (await res.json()) as {
    web: { results: { title: string; url: string; description: string }[] };
  };
  return (data.web?.results ?? [])
    .slice(0, maxResults)
    .map((r) => `[${r.title}]\n${r.description}\n출처: ${r.url}`)
    .join('\n\n');
}

async function execFetchUrl(args: Record<string, any>): Promise<string> {
  const url = args.url as string;
  const max_chars = (args.max_chars as number | undefined) ?? 3000;
  if (!url?.startsWith('http'))
    return 'URL은 http:// 또는 https://로 시작해야 합니다.';

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResearchAI/1.0)' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const text = await res.text();
    return text.slice(0, max_chars);
  }

  const html = await res.text();
  // 기본적인 HTML 태그 제거
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{3,}/g, '\n\n')
    .trim();

  return (
    text.slice(0, max_chars) +
    (text.length > max_chars ? '\n...(이하 생략)' : '')
  );
}

function execCalculate(args: Record<string, any>): string {
  const expr = ((args.expression as string | undefined) ?? '').trim();
  // 안전한 문자만 허용: 숫자, 연산자, 괄호, 공백, 소수점
  if (!/^[\d\s+\-*/%.()^**]+$/.test(expr)) {
    return `허용되지 않는 문자가 포함된 식입니다: ${expr}`;
  }
  // ** 를 Math.pow로 변환하지 않고 JS ** 연산자 그대로 사용 (ES2016+)

  const result = Function(`"use strict"; return (${expr})`)();
  if (typeof result !== 'number' || !isFinite(result)) {
    return `계산할 수 없는 식입니다: ${expr}`;
  }
  return `${expr} = ${result}`;
}

const UNIT_CONVERSIONS: Record<
  string,
  Record<string, (v: number) => number>
> = {
  // 길이 → 미터 기준
  km: {
    m: (v) => v * 1000,
    cm: (v) => v * 100_000,
    mm: (v) => v * 1_000_000,
    mile: (v) => v * 0.621371,
    yard: (v) => v * 1093.61,
    feet: (v) => v * 3280.84,
    inch: (v) => v * 39370.1,
  },
  m: {
    km: (v) => v / 1000,
    cm: (v) => v * 100,
    mm: (v) => v * 1000,
    mile: (v) => v * 0.000621371,
    feet: (v) => v * 3.28084,
    inch: (v) => v * 39.3701,
  },
  cm: {
    m: (v) => v / 100,
    km: (v) => v / 100_000,
    mm: (v) => v * 10,
    inch: (v) => v * 0.393701,
    feet: (v) => v * 0.0328084,
  },
  mm: {
    cm: (v) => v / 10,
    m: (v) => v / 1000,
    km: (v) => v / 1_000_000,
    inch: (v) => v * 0.0393701,
  },
  inch: {
    cm: (v) => v * 2.54,
    m: (v) => v * 0.0254,
    feet: (v) => v / 12,
    mm: (v) => v * 25.4,
  },
  feet: {
    m: (v) => v * 0.3048,
    cm: (v) => v * 30.48,
    inch: (v) => v * 12,
    km: (v) => v * 0.0003048,
  },
  mile: {
    km: (v) => v * 1.60934,
    m: (v) => v * 1609.34,
    feet: (v) => v * 5280,
  },
  yard: { m: (v) => v * 0.9144, feet: (v) => v * 3, inch: (v) => v * 36 },
  // 무게 → kg 기준
  kg: {
    g: (v) => v * 1000,
    mg: (v) => v * 1_000_000,
    lb: (v) => v * 2.20462,
    oz: (v) => v * 35.274,
    t: (v) => v / 1000,
  },
  g: {
    kg: (v) => v / 1000,
    mg: (v) => v * 1000,
    lb: (v) => v * 0.00220462,
    oz: (v) => v * 0.035274,
  },
  mg: { g: (v) => v / 1000, kg: (v) => v / 1_000_000 },
  lb: { kg: (v) => v * 0.453592, g: (v) => v * 453.592, oz: (v) => v * 16 },
  oz: { g: (v) => v * 28.3495, kg: (v) => v * 0.0283495, lb: (v) => v / 16 },
  t: { kg: (v) => v * 1000, g: (v) => v * 1_000_000, lb: (v) => v * 2204.62 },
  // 온도 (특수 처리)
  celsius: { fahrenheit: (v) => (v * 9) / 5 + 32, kelvin: (v) => v + 273.15 },
  fahrenheit: {
    celsius: (v) => ((v - 32) * 5) / 9,
    kelvin: (v) => ((v - 32) * 5) / 9 + 273.15,
  },
  kelvin: {
    celsius: (v) => v - 273.15,
    fahrenheit: (v) => ((v - 273.15) * 9) / 5 + 32,
  },
  // 데이터 크기
  byte: {
    kb: (v) => v / 1024,
    mb: (v) => v / 1024 ** 2,
    gb: (v) => v / 1024 ** 3,
    tb: (v) => v / 1024 ** 4,
  },
  kb: { byte: (v) => v * 1024, mb: (v) => v / 1024, gb: (v) => v / 1024 ** 2 },
  mb: {
    byte: (v) => v * 1024 ** 2,
    kb: (v) => v * 1024,
    gb: (v) => v / 1024,
    tb: (v) => v / 1024 ** 2,
  },
  gb: {
    byte: (v) => v * 1024 ** 3,
    kb: (v) => v * 1024 ** 2,
    mb: (v) => v * 1024,
    tb: (v) => v / 1024,
  },
  tb: {
    gb: (v) => v * 1024,
    mb: (v) => v * 1024 ** 2,
    kb: (v) => v * 1024 ** 3,
  },
};

function execConvertUnit(args: Record<string, any>): string {
  const value = args.value as number;
  const from_unit = args.from_unit as string;
  const to_unit = args.to_unit as string;
  const from = from_unit.toLowerCase();
  const to = to_unit.toLowerCase();

  if (from === to) return `${value} ${from_unit} = ${value} ${to_unit}`;

  const converter = UNIT_CONVERSIONS[from]?.[to];
  if (!converter) {
    return `${from_unit} → ${to_unit} 변환은 지원하지 않습니다.`;
  }

  const result = converter(value);
  const rounded = parseFloat(result.toPrecision(8));
  return `${value} ${from_unit} = ${rounded} ${to_unit}`;
}
