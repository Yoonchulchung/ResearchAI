/**
 * generate_chart AI 툴 정의 + 트리거 감지
 *
 * AI가 시장 분석·성장률 데이터를 발견하면 이 툴을 호출해
 * 구조화된 차트 데이터를 생성한다.
 */

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface ChartSeries {
  name: string;
  data: ChartDataPoint[];
}

export interface ChartData {
  type: 'line' | 'bar' | 'pie' | 'area';
  title: string;
  series: ChartSeries[];
  unit?: string;
  source?: string;
}

// ── 트리거 키워드 ────────────────────────────────────────────────
const CHART_TRIGGER_PATTERNS = [
  /시장\s*(규모|성장|점유율|전망|예측|분석)/,
  /성장률\s*(예측|전망|추이|분석)?/,
  /market\s*(size|growth|share|forecast|analysis)/i,
  /cagr/i,
  /매출\s*(성장|추이|전망)/,
  /점유율\s*(변화|추이|비교)/,
  /연도별\s*(매출|성장|시장)/,
  /\d{4}[-~]\d{4}.*(시장|성장|매출)/,
];

export function isChartTrigger(prompt: string): boolean {
  return CHART_TRIGGER_PATTERNS.some((p) => p.test(prompt));
}

// ── Anthropic tool_use 포맷 ──────────────────────────────────────
export const CHART_TOOL_ANTHROPIC = {
  name: 'generate_chart',
  description:
    '시장 규모, 성장률, 점유율 등 수치 데이터를 차트로 시각화합니다. ' +
    '연도별·기간별 수치 데이터가 3개 이상 있을 때 호출하세요. ' +
    '텍스트 답변과 별개로 차트 데이터를 구조화해 반환합니다.',
  input_schema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['line', 'bar', 'pie', 'area'],
        description:
          '차트 유형: 추이→line/area, 비교→bar, 비율→pie',
      },
      title: { type: 'string', description: '차트 제목 (한국어)' },
      unit: { type: 'string', description: '값의 단위 (예: 억달러, %, 조원)' },
      source: { type: 'string', description: '데이터 출처' },
      series: {
        type: 'array',
        description: '데이터 계열 목록',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '계열 이름' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  label: {
                    type: 'string',
                    description: 'X축 레이블 (연도, 분기 등)',
                  },
                  value: { type: 'number', description: 'Y축 수치 값' },
                },
                required: ['label', 'value'],
              },
            },
          },
          required: ['name', 'data'],
        },
      },
    },
    required: ['type', 'title', 'series'],
  },
};

// ── OpenAI function_calling 포맷 ─────────────────────────────────
export const CHART_TOOL_OPENAI = {
  type: 'function',
  function: {
    name: 'generate_chart',
    description: CHART_TOOL_ANTHROPIC.description,
    parameters: CHART_TOOL_ANTHROPIC.input_schema,
  },
};

// ── 차트 시스템 프롬프트 보충 ────────────────────────────────────
export const CHART_SYSTEM_ADDENDUM = `

## 차트 생성 지침
분석 중 시장 규모, 성장률, 연도별 수치 등 시각화가 유용한 데이터를 발견하면
반드시 generate_chart 툴을 호출하여 구조화된 차트 데이터를 생성하세요.
- 3개 이상의 연도·기간 데이터가 있으면 line 또는 area 차트
- 항목 간 비교(국가별, 기업별)는 bar 차트
- 비율·점유율은 pie 차트
- 툴 호출은 텍스트 답변 작성 중 언제든 가능하며, 여러 차트를 생성해도 됩니다`;
