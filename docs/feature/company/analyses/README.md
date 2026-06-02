# 기업 분석 구조

## 목적

현재 BE에서 기업 분석이 어떻게 동작하는지 정리한다.
Spring BE와 BE_BROWSE 분리 이후에는 이 흐름을 기준으로 기업 분석 요청, 자료 수집, AI 분석, 결과 저장 구조를 재구성한다.

## 현재 BE 출처

| 영역 | 현재 파일 |
|------|-----------|
| 기업 분석 API | `BE/src/company/presentation/company-analysis.controller.ts` |
| 기업 분석 실행 | `BE/src/company/application/company-analysis.service.ts` |
| 큐 기반 기업 분석 실행 | `BE/src/queue/application/job/company-analysis-executor.service.ts` |
| 기업 분석 프롬프트 | `BE/src/company/domain/company-analysis.prompts.ts` |
| 기업 분석 DTO | `BE/src/company/domain/company-analysis.types.ts` |
| 기업 분석 저장 엔티티 | `BE/src/company/domain/entity/company-analysis.entity.ts` |

## 전체 동작 구조

```mermaid
flowchart TD
    User["사용자"]
    FE["FE 기업 분석 화면"]
    API["CompanyAnalysisController"]
    Queue{"큐 작업 여부"}
    Executor["CompanyAnalysisExecutorService"]
    Service["CompanyAnalysisService.analyzeStream"]

    ModelCheck["AI 모델 검증"]
    Search["웹 검색 자료 수집"]
    Crawl["크롤링 자료 수집"]
    External["외부 API 자료 수집"]
    Context["AI 입력 컨텍스트 조립"]
    ParallelAI["AI 4개 병렬 분석"]
    Parse["JSON 파싱 및 검증"]
    Persist["DB 저장"]
    Done["분석 결과 반환"]

    User --> FE
    FE --> API
    API --> Queue
    Queue -->|즉시 실행/SSE| Service
    Queue -->|큐 실행| Executor
    Executor --> Service

    Service --> ModelCheck
    ModelCheck --> Search
    Search --> Crawl
    Crawl --> External
    External --> Context
    Context --> ParallelAI
    ParallelAI --> Parse
    Parse --> Persist
    Persist --> Done
    Done --> API
    API --> FE
```

## 자료 수집 흐름

```mermaid
flowchart TD
    Start["기업명 입력"]
    Talent["인재상/핵심가치/채용 공식 검색"]
    News["최근 뉴스 검색"]
    Segment["사업부문/매출비중 검색"]
    JobIntro["직무소개 검색"]
    JobPosting["채용 공고 검색"]
    Competitor["경쟁사 후보 검색"]
    OfficialSite["공식 웹사이트 탐색"]
    HrTech["기술 조직/HRD 신호 크롤링"]
    Dart{"DART API Key 있음?"}
    DartFetch["DART 재무/공시/임직원 데이터 수집"]
    Jobplanet{"잡플래닛 계정 있음?"}
    JobplanetFetch["잡플래닛 리뷰/평점 수집"]
    RealEstate{"DART 주소 있음?"}
    Apartment["인근 아파트 시세 조회"]
    ContextParts["분석 컨텍스트 조립"]

    Start --> Talent
    Talent --> News
    News --> Segment
    Segment --> JobIntro
    JobIntro --> JobPosting
    JobPosting --> Competitor
    Competitor --> OfficialSite
    OfficialSite --> HrTech
    HrTech --> Dart
    Dart -->|예| DartFetch
    Dart -->|아니오| Jobplanet
    DartFetch --> Jobplanet
    Jobplanet -->|예| JobplanetFetch
    Jobplanet -->|아니오| RealEstate
    JobplanetFetch --> RealEstate
    RealEstate -->|예| Apartment
    RealEstate -->|아니오| ContextParts
    Apartment --> ContextParts
```

## AI 분석 병렬 호출

```mermaid
flowchart LR
    Context["통합 분석 컨텍스트"]

    Scoring["SYSTEM_PROMPT_SCORING"]
    Business["SYSTEM_PROMPT_BUSINESS"]
    Report["SYSTEM_PROMPT_REPORT"]
    HR["SYSTEM_PROMPT_HR"]

    Scores["핵심 역량 점수/근거"]
    Swot["SWOT"]
    Industry["산업/기업 규모/신용등급"]

    Competitors["검증된 경쟁사"]
    Segments["사업부문"]
    Profile["기업 프로파일"]
    Mission["미션/비전/인재상"]

    ReportOut["기업 분석 보고서"]
    NewsCat["뉴스 카테고리/요약"]

    HrWheel["HR Wheel"]
    CVF["경쟁 가치 모델"]
    Ulrich["울리치 모델"]
    Harvard["하버드 모델"]
    CareerUrl["채용 페이지 URL"]

    Context --> Scoring
    Context --> Business
    Context --> Report
    Context --> HR

    Scoring --> Scores
    Scoring --> Swot
    Scoring --> Industry

    Business --> Competitors
    Business --> Segments
    Business --> Profile
    Business --> Mission

    Report --> ReportOut
    Report --> NewsCat

    HR --> HrWheel
    HR --> CVF
    HR --> Ulrich
    HR --> Harvard
    HR --> CareerUrl
```

## 결과 저장 흐름

```mermaid
flowchart TD
    Parsed["AI 분석 결과"]
    Company["companies"]
    Financial["company_financial"]
    Analysis["company_analyses"]
    Rate["company_rate"]
    DTO["CompanyAnalysisDto"]
    View["기업 상세/분석 화면"]

    Parsed --> Company
    Parsed --> Financial
    Parsed --> Analysis
    Parsed --> Rate

    Company --> DTO
    Financial --> DTO
    Analysis --> DTO
    Rate --> DTO
    DTO --> View
```

## 저장되는 주요 산출물

| 산출물 | 설명 |
|--------|------|
| `scores` | 13개 핵심 역량 점수 |
| `reasons` | 역량별 점수 근거 |
| `summary` | 인재상/조직문화 요약 |
| `swot` | 강점, 약점, 기회, 위협 |
| `competitors` | 크롤링 출처로 검증된 경쟁사 |
| `businessSegments` | 사업부문, 매출비중, 제품/시설/종속회사 |
| `companyProfile` | 사업영역, 직무소개, 핵심가치, 주요 업적 |
| `missionVision` | 미션, 비전, 핵심가치, 인재상 |
| `recentNews` | 최근 뉴스와 AI 카테고리/요약 |
| `jobPostings` | 채용 공고 링크 |
| `hrTechSources` | 기술 조직/HRD 분석에 사용한 출처 |
| `hrAnalysis` | HR Wheel, CVF, 울리치 모델, 하버드 모델 |
| `report` | 기업 개요, 사업 모델, 재무, 조직문화, 투자 관점 보고서 |
| `sourceContext` | AI에 제공한 통합 원자료 묶음 |

## BE_BROWSE 이전 시 고려사항

- BE는 기업 분석 요청과 결과 조회 DTO만 담당한다.
- BE_BROWSE는 검색, 크롤링, DART/잡플래닛 연동, AI 분석, 결과 파싱을 담당한다.
- 분석 요청은 UUID 기반 큐 작업으로 등록하고, 상태는 `queued`, `running`, `done`, `failed`로 관리한다.
- AI 병렬 호출은 `scoring`, `business`, `report`, `hr` 작업 단위로 분리한다.
- JSON 응답은 작업별 파서에서 검증하고, 실패한 하위 분석은 부분 실패로 기록한다.
- `sourceContext`는 이후 기업 분석 챗봇/근거 확인에 사용되므로 반드시 저장한다.
