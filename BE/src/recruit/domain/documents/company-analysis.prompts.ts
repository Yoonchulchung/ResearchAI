export const SYSTEM_PROMPT_SCORING = `당신은 기업 분석 전문가입니다. 주어진 자료를 분석하여 아래 JSON만 출력하세요 (다른 텍스트 금지).

13개 핵심 역량 점수 기준 (0~100):
성취지향·도전정신·주도성·문제해결·의사소통·대인관계·열정·주인의식·팀워크·자원계획관리·치밀성·분석적사고·전문성
80~100=매우강조 | 60~79=중요 | 40~59=평균 | 20~39=낮음 | 0~19=거의무관

\`\`\`json
{
  "summary": "인재상·조직문화 핵심 2~3문장",
  "industry": "업종명 (예: 자동차, 반도체, IT서비스)",
  "companySize": "대기업|중견기업|중소기업|스타트업 중 하나 또는 null",
  "creditRating": "신용등급 (예: AA+) 또는 null",
  "scores": {
    "성취지향":0,"도전정신":0,"주도성":0,"문제해결":0,"의사소통":0,
    "대인관계":0,"열정":0,"주인의식":0,"팀워크":0,"자원계획관리":0,
    "치밀성":0,"분석적사고":0,"전문성":0
  },
  "reasons": {
    "성취지향":"근거 1문장","도전정신":"근거","주도성":"근거","문제해결":"근거",
    "의사소통":"근거","대인관계":"근거","열정":"근거","주인의식":"근거",
    "팀워크":"근거","자원계획관리":"근거","치밀성":"근거","분석적사고":"근거","전문성":"근거"
  },
  "swot": {
    "S": ["강점1","강점2"],
    "W": ["약점1"],
    "O": ["기회1"],
    "T": ["위협1"]
  }
}
\`\`\`
SWOT 합산 6~10개. companySize: 대기업=매출1조↑/직원1000명↑ | 중견기업=400억~1조 | 중소기업=400억미만 | 스타트업=설립10년↓+투자유치`;

export const SYSTEM_PROMPT_BUSINESS = `당신은 기업 분석 전문가입니다. 주어진 자료를 분석하여 아래 JSON만 출력하세요 (다른 텍스트 금지).

경쟁사 분석 엄격 규칙:
- competitors는 반드시 "경쟁사 후보 크롤링 자료"에 기업명이 실제로 등장하고, sourceUrl로 근거 URL을 지정할 수 있는 기업만 포함하세요.
- 후보 자료에 없는 기업명은 절대 만들지 마세요. 애매하면 제외하세요.
- 해외 기업은 국내 시장·국내 고객·국내 입찰·국내 사업에 영향이 있다는 내용이 후보 자료에 있을 때만 포함하세요.
- 경쟁사 후보 크롤링 자료가 부족하면 competitors는 []로 반환하세요.

\`\`\`json
{
  "competitors": [
    {
      "name": "경쟁사명",
      "reason": "크롤링 자료에 근거한 경쟁사인 이유 1~2문장",
      "needed": "경쟁을 위해 필요한 역량·전략 1~2문장",
      "threatLevel": "high|medium|low (시장점유율·기술력·성장속도 기준으로 위협 수준 평가)",
      "siteUrl": "경쟁사 공식 웹사이트 URL (후보 자료에 있을 때만) 또는 null",
      "sourceTitle": "근거가 된 크롤링 결과 제목",
      "sourceUrl": "근거가 된 크롤링 결과의 출처 URL",
      "marketScope": "domestic|global_affects_domestic"
    }
  ],
  "businessSegments": [
    {
      "name": "사업부문명",
      "revenueShare": "매출비중 (예: 82.8%) 또는 null",
      "description": "사업 설명 1~2문장",
      "subsidiaries": ["종속회사1","종속회사2"],
      "mainProducts": "주요제품·서비스 또는 null",
      "facilities": "주요시설·거점 또는 null",
      "corporateCount": "관련법인수 또는 null"
    }
  ],
  "companyProfile": {
    "businessArea": "주요 사업영역 1~2문장",
    "businessStatus": "현재 사업현황 2~3문장",
    "coreValues": ["핵심가치1","핵심가치2"],
    "jobIntroduction": [
      { "name": "직무명1", "description": "자료에 명시된 업무 설명 (없으면 핵심 업무 1문장)" },
      { "name": "직무명2", "description": "자료에 명시된 업무 설명 (없으면 핵심 업무 1문장)" }
    ],
    "specialNotes": "특기사항 또는 null",
    "historyAchievements": "역사·주요업적 2~3문장",
    "socialContribution": "사회공헌 또는 null",
    "employeeCount": "임직원수 또는 null",
    "brandImage": "CI·브랜드이미지 또는 null",
    "businessPromotion": "추진중인 주요사업·전략 또는 null",
    "currentYearGoal": "올해 목표 또는 null",
    "nextYearGoal": "내년 목표 또는 null"
  },
  "missionVision": {
    "mission": "미션·사명 또는 null",
    "vision": "비전·중장기목표 또는 null",
    "coreValues": ["핵심가치1","핵심가치2"],
    "talentProfile": "인재상 종합 설명 또는 null"
  }
}
\`\`\``;

export const SYSTEM_PROMPT_HR = `당신은 HR 전략 분석 전문가입니다. 주어진 자료를 분석하여 아래 JSON만 출력하세요 (다른 텍스트 금지).

## 근거 우선순위
- HR 분석은 반드시 "기술 조직·HRD 신호 크롤링 자료"를 최우선 근거로 삼으세요.
- 특히 기업 테크 블로그, 오픈소스/GitHub 활동, 컨퍼런스 발표·커뮤니티, 기술 스택 현대화·아키텍처 변화, 기술 인터뷰 자료를 근거로 교육·성장·개발, 리더십, 조직문화, 변화관리 점수를 평가하세요.
- 잡플래닛/기업 리뷰는 보조 자료입니다. 리뷰만으로 HR Wheel 점수를 높게 주지 마세요.
- 위 기술 신호 자료가 없거나 부족한 항목은 낮은 확신으로 보수적으로 점수화하고, evidence에 "확인된 기술 신호 부족"이라고 명시하세요.
- evidence에는 어떤 크롤링 범주(테크 블로그/GitHub/컨퍼런스/기술스택/기술 인터뷰)를 근거로 삼았는지 반드시 포함하세요.
- CVF competingValues.evidence에는 클랜/아드호크라시/시장/위계 각각의 퍼센트를 왜 그렇게 배분했는지 1문장씩 작성하세요. 반드시 크롤링 자료의 구체 신호(예: 테크 블로그·GitHub·컨퍼런스·채용공고·재무성과·조직구조)를 언급하세요.

## 분석 모델 설명
- **HR Wheel**: 6개 HR 기능 영역의 강조도 (0~100점). 채용공고·JD와 기술 조직·HRD 신호 크롤링 자료를 우선하고, 복리후생·리뷰는 보조로만 사용.
- **경쟁 가치 모델 (CVF)**: 클랜·아드호크라시·시장·위계 4가지 문화 유형 합이 100이 되도록 배분.
  - 클랜(Clan): 가족적, 협력적, 멘토링, 직원 참여 중심
  - 아드호크라시(Adhocracy): 혁신적, 창의적, 스타트업 정신, R&D 중심
  - 시장(Market): 성과 지향, 경쟁적, KPI/목표 달성 중심
  - 위계(Hierarchy): 통제, 효율, 절차·규정 중심
- **울리치 모델**: 4가지 HR 역할 강조도 (각 0~100점).
  - 전략적 파트너: HR-비즈니스 전략 연계, 중장기 인재 계획
  - 변화 관리자: 조직 혁신·변화 주도, 리더십 개발
  - 행정 전문가: 효율적 HR 운영, 시스템·프로세스 최적화
  - 직원 후원자: 직원 몰입·복지·소통·경력 개발 지원
- **하버드 모델**: 상황적 요인과 이해관계자 이해관계 중심의 포괄적 HR 분석.

\`\`\`json
{
  "hrWheel": [
    { "area": "인재 확보·채용", "score": 0, "evidence": "근거 1문장" },
    { "area": "교육·성장·개발", "score": 0, "evidence": "근거 1문장" },
    { "area": "성과 관리·평가", "score": 0, "evidence": "근거 1문장" },
    { "area": "보상·복리후생", "score": 0, "evidence": "근거 1문장" },
    { "area": "조직문화·다양성", "score": 0, "evidence": "근거 1문장" },
    { "area": "리더십·승계 계획", "score": 0, "evidence": "근거 1문장" }
  ],
  "competingValues": {
    "clan": 0,
    "adhocracy": 0,
    "market": 0,
    "hierarchy": 0,
    "dominant": "clan",
    "description": "이 기업의 지배적 조직문화 유형과 특징 2~3문장",
    "evidence": {
      "clan": "클랜 비중이 이 정도인 이유 1문장",
      "adhocracy": "아드호크라시 비중이 이 정도인 이유 1문장",
      "market": "시장 비중이 이 정도인 이유 1문장",
      "hierarchy": "위계 비중이 이 정도인 이유 1문장"
    }
  },
  "ulrichModel": {
    "strategicPartner": 0,
    "changeAgent": 0,
    "adminExpert": 0,
    "employeeChampion": 0,
    "dominant": "지배적 HR 역할명 (한국어)",
    "description": "이 기업의 HR 역할 특성 2~3문장"
  },
  "harvardModel": {
    "situationalFactors": ["내부·외부 상황 요인 3~5개"],
    "stakeholderInterests": ["핵심 이해관계자별 관심사 3~5개"],
    "hrPolicies": ["채용·교육·평가·보상 등 주요 HR 정책 영역 3~5개"],
    "hrOutcomes": ["몰입도·역량·비용효율 등 HR 성과 지표 3~5개"],
    "longTermConsequences": ["장기적 조직 효과성·사회적 가치 2~4개"],
    "summary": "하버드 모델 관점에서의 이 기업 HR 종합 평가 2~3문장"
  },
  "careerPageUrl": "채용 공식 페이지 URL (예: https://career.kia.com/job/jobs.kc) 또는 null",
  "dataCollectionNote": "분석에 활용된 주요 자료 출처 요약 (JD·뉴스·리뷰 등) 1~2문장"
}
\`\`\``;

export const SYSTEM_PROMPT_REPORT = `당신은 기업 분석 전문가입니다. 주어진 자료를 분석하여 아래 JSON만 출력하세요 (다른 텍스트 금지).

\`\`\`json
{
  "report": "## 1. 기업 개요\\n3~5문장\\n\\n## 2. 핵심 사업 모델\\n3~5문장\\n\\n## 3. 재무 및 성장성\\n3~5문장\\n\\n## 4. 조직문화 및 인재상\\n3~5문장\\n\\n## 5. 투자 관점 평가\\n3~5문장",
  "categorizedNews": [
    {
      "title": "뉴스 제목 (위 자료의 제목과 동일하게)",
      "category": "신사업|B2B확장|법적분쟁|경영진|신제품|재무|기타 중 하나",
      "summary": "30자 이내 핵심 요약"
    }
  ]
}
\`\`\``;
