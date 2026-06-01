# Refactor 문서

작성일: 2026-06-01

`docs/refactor`는 NestJS 단일 `BE`를 Spring `BE`와 FastAPI `BE_BROWSE`로 분리하는 대규모 리팩토링 계획을 관리한다.

## 문서 구조

| 문서 | 역할 |
|------|------|
| [be-browse-spring-migration-plan.md](be-browse-spring-migration-plan.md) | 전체 로드맵과 Phase 관리 |
| [BE/BE.md](BE/BE.md) | Spring BE 설계 |
| [BE_BROWSE/BE_BROWSE.md](BE_BROWSE/BE_BROWSE.md) | FastAPI BE_BROWSE 설계 |
| [CONNECT/CONNECT.md](CONNECT/CONNECT.md) | BE와 BE_BROWSE 연결 설계 |
| [CONNECT/API.md](CONNECT/API.md) | BE_BROWSE internal API 명세 |

## 책임 분리

| 대상 | 책임 |
|------|------|
| BE | public API, auth, domain CRUD, DB, QueueJob, FE event |
| BE_BROWSE | search engine, browser/crawling, OCR/RAG, AI 도구 실행 |
| CONNECT | BE가 BE_BROWSE를 enqueue/status/result/cancel로 연결하는 계약 |

## 핵심 결정

- FE는 Spring BE만 호출한다.
- BE_BROWSE는 내부 서비스이며 외부 공개하지 않는다.
- BE_BROWSE의 모든 실행 요청은 UUID request queue에 들어간다.
- BE_BROWSE worker는 초기에는 전역 concurrency `1`로 순차 처리한다.
- BE와 BE_BROWSE는 REST over HTTP/2를 목표로 한다.
- Spring BE는 WebFlux를 사용하지 않고 Java 21 virtual thread + JDK HttpClient를 사용한다.
- Spring BE public API는 DTO를 필수로 사용한다.
- Spring BE는 OOP, CQRS, AOP, DIP, ArchUnit 결합도 보호 규칙을 따른다.
- BE_BROWSE는 FastAPI + Modular Clean/Hexagonal 구조를 따른다.

## 작업 순서

1. Phase 0 inventory 문서 작성
2. BE_BROWSE request queue skeleton
3. BE_BROWSE search engine skeleton
4. Spring BE skeleton
5. CONNECT API 연동
6. DB 전환
7. 화면 단위 API 이관
8. 배포 전환
9. NestJS 제거

작업자는 먼저 [be-browse-spring-migration-plan.md](be-browse-spring-migration-plan.md)의 마지막 완료 Phase를 확인한 뒤 진행한다.
