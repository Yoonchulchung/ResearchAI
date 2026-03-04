export const PROMPTS = {
  // 리서치 태스크 목록 생성
  generateTasks: (topic: string, searchContext?: string) => {
    const contextBlock = searchContext
      ? `\n아래는 이 주제에 대한 최신 검색 결과입니다. 이를 참고하여 현실적이고 구체적인 조사 항목을 생성하세요:\n[검색 결과]\n${searchContext}\n`
      : '';
    return `리서치 주제: "${topic}"
${contextBlock}
이 주제에 대한 심층 리서치를 위해 5~7개의 조사 항목을 생성하세요.
반드시 아래 JSON 배열 형식만 반환하세요 (다른 텍스트, 마크다운 코드블록 없이):
[
  {
    "id": 1,
    "title": "항목 제목 (간결하게 10자 이내)",
    "icon": "관련 이모지 1개",
    "prompt": "AI에게 전달할 상세 검색 프롬프트. 반드시 한국어로 답하도록 지시 포함."
  }
]`;
  },

  // AI 공통 시스템 프롬프트
  system: '당신은 전문 리서치 어시스턴트입니다. 최신 정보를 기반으로 한국어로 상세하고 구조화된 마크다운 형식으로 답변하세요.',

  // 외부 검색 결과를 포함한 질문 프롬프트
  withSearchContext: (context: string, prompt: string) =>
    `다음 검색 결과를 바탕으로 아래 질문에 한국어로 상세하게 답하세요. 마크다운 형식으로 작성하세요.\n\n[검색 결과]\n${context}\n\n[질문]\n${prompt}`,

  // Ollama를 이용한 검색 결과 압축
  ollamaFilter: (query: string, context: string) =>
    `질문: "${query}"\n\n너는 정보 밀도를 극대화하는 리서치 압축기야. 아래 텍스트에서 모든 수치, 고유 명사, 기술적 사양은 100% 보존해. 하지만 모든 형용사, 접속사, 중복되는 수식어는 제거하고 키워드 중심의 '시맨틱 마크다운' 형식으로 압축해. 클로드(LLM)가 읽을 데이터니까 문법보다는 정보의 보존율에 집중해.\n\n${context}`,
};
