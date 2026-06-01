# 설정/관리 기능 명세

## 목적

사용자가 API 키, 기본 모델, 시스템 상태, 사용량, 파이프라인 테스트, 배경 설정을 관리할 수 있게 한다.

## 주요 화면

| 경로 | 설명 |
|------|------|
| `/settings` | 설정 홈 |
| `/settings/overview` | API 키, 서비스 상태, 사용량 |
| `/settings/analytics` | 토큰/비용 분석 |
| `/settings/analytics/logs` | AI 호출 이력 |
| `/settings/pipeline` | 파이프라인 테스트 |
| `/settings/system` | 시스템 설정 |
| `/settings/background` | 배경 이미지 설정 |

## API 키/모델 설정

### 기능 요구

- 사용자는 개인 API 키를 저장할 수 있다.
- Anthropic, OpenAI, Google, Tavily, Serper, Naver, Brave 등 provider별 설정 상태를 확인한다.
- 사용자는 기본 클라우드 모델과 로컬 모델을 설정할 수 있다.
- 개인 키가 없을 경우 시스템 기본 키 또는 fallback chain을 사용할 수 있다.

## 서비스 상태

### 기능 요구

- 사용자는 검색 엔진, AI provider, Ollama, Qdrant 상태를 확인할 수 있다.
- 설정이 없는 서비스는 비활성/미설정 상태로 표시한다.

### 주요 API

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/api/overview/pipeline-status` | 검색/AI/provider 상태 |
| `GET` | `/api/overview/tavily` | Tavily 사용량 |

## 사용량/로그

### 기능 요구

- 사용자는 모델별 토큰 사용량과 추정 비용을 확인할 수 있다.
- admin 사용자는 AI 호출 로그를 볼 수 있다.
- 로그에는 모델, caller, prompt/response 일부, 토큰, 비용, 오류, 소요 시간이 포함될 수 있다.

## 파이프라인 테스트

### 기능 요구

- admin 사용자는 Prompt Test, Recruit Test, Doc Parse Test, RAG Debug, AI Call Log를 사용할 수 있다.
- 테스트 화면은 실제 운영 데이터와 분리된 실험/검증 용도로 사용한다.

## 배경 설정

### 기능 요구

- 사용자는 앱 배경 이미지를 설정하거나 변경할 수 있다.
- 배경 설정은 전역 UI에 반영된다.

## 예외/권한

- admin 전용 화면은 visitor에게 노출하지 않는다.
- API 키 저장 실패 시 원인을 표시한다.
- 민감 정보는 화면에 원문 전체를 노출하지 않는다.
