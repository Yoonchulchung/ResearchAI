# BE 리팩토링 설계

작성일: 2026-06-01

## 역할

`BE/`는 Spring Boot 기반 public backend다. FE가 직접 호출하는 API, 인증, 권한, 도메인 CRUD, DB 트랜잭션, 사용자-facing queue 상태를 소유한다.

| 영역 | 책임 |
|------|------|
| Public API | FE REST/SSE/WS 계약 유지 |
| Auth | JWT, 사용자, 역할, 사용자별 API key |
| Domain data | company, recruit, resume, document, news metadata |
| Queue | job 생성, 상태, 취소, 재시도, FE 이벤트 |
| Persistence | PostgreSQL, Flyway migration, transaction |
| Operations | Actuator, metrics, audit, tracing |
| BE_BROWSE 연동 | enqueue/status/result/cancel client |

BE는 AI, browse, crawling, OCR, embedding 실행을 직접 담당하지 않는다. 해당 실행은 [BE_BROWSE](../BE_BROWSE/BE_BROWSE.md)에 위임한다.

## 패키지 구조

```text
BE/
└── src/main/java/.../
    ├── ResearchAiApplication.java
    ├── global/
    │   ├── config/
    │   ├── async/
    │   ├── aop/
    │   ├── error/
    │   ├── security/
    │   ├── web/
    │   └── observability/
    ├── auth/
    │   ├── presentation/
    │   │   └── dto/
    │   │       ├── request/
    │   │       └── response/
    │   ├── application/
    │   │   ├── command/
    │   │   └── query/
    │   ├── domain/
    │   └── infrastructure/
    ├── queue/
    │   ├── presentation/
    │   ├── application/
    │   │   ├── command/
    │   │   └── query/
    │   ├── domain/
    │   └── infrastructure/
    ├── company/
    ├── recruit/
    ├── news/
    ├── documents/
    └── bebrowse/
        ├── application/
        ├── domain/
        └── infrastructure/
```

각 feature module은 `presentation/application/domain/infrastructure`를 기본으로 한다. `application`은 command/query use case로 분리한다.

## OOP 규칙

- Controller는 HTTP mapping, validation, authentication context 변환만 담당한다.
- Application service는 use case class로 작성한다. 예: `CreateQueueJobUseCase`, `AnalyzeCompanyUseCase`.
- Use case는 transaction boundary와 orchestration을 담당한다.
- 비즈니스 판단은 domain object, policy, strategy 객체에 둔다.
- Domain entity/value object는 행위와 불변 조건을 가진다. getter/setter DTO처럼 만들지 않는다.
- Spring bean 주입은 constructor injection만 사용한다.
- 복잡한 if/switch는 `Policy`, `Strategy`, `Resolver`, `Factory` 객체로 분리한다.
- JPA entity, API DTO, domain model을 직접 공유하지 않는다.
- 공통 util class 남용을 피하고, 의미 있는 동작은 value object나 domain service로 승격한다.

## DTO 규칙

- 모든 public API는 request DTO와 response DTO를 반드시 둔다.
- Controller method는 JPA entity, domain entity, `Map`, raw JSON tree를 직접 반환하지 않는다.
- Request DTO는 `presentation/dto/request`, response DTO는 `presentation/dto/response`에 둔다.
- Use case 입력은 command/query 객체로 변환한다.
- Use case 출력은 result 객체로 받고, Controller에서 response DTO로 변환한다.
- DTO에는 Bean Validation annotation을 명시한다. 예: `@NotBlank`, `@Size`, `@Valid`.
- FE compatibility가 필요한 응답 shape는 DTO test 또는 JSON snapshot test로 고정한다.
- BE_BROWSE 호출용 DTO는 public API DTO와 분리한다. 예: `bebrowse.domain.request.BeBrowseRequest`.

## CQRS

BE는 application layer에서 command와 query를 분리한다.

| 모듈 | Command 예시 | Query 예시 |
|------|--------------|------------|
| auth | `SignUpCommand`, `LoginCommand`, `UpdateApiKeysCommand` | `GetMeQuery`, `GetApiKeyStatusQuery` |
| queue | `EnqueueJobCommand`, `CancelJobCommand`, `RetryJobCommand` | `GetJobStatusQuery`, `ListJobsQuery` |
| company | `CreateCompanyCommand`, `AnalyzeCompanyCommand`, `RefreshCompanyProfileCommand` | `GetCompanyQuery`, `ListCompaniesQuery` |
| recruit | `CollectJobPostingsCommand`, `AnalyzeCoverLetterCommand` | `ListJobPostingsQuery`, `GetResumeQuery` |
| news | `CollectNewsCommand`, `SummarizeArticleCommand` | `ListNewsQuery`, `GetPaperQuery` |
| documents | `UploadDocumentCommand`, `ParseDocumentCommand` | `ListDocumentsQuery`, `GetDocumentQuery` |

Command use case는 상태 변경을 담당한다. Query use case는 읽기 전용이며 DB 변경, BE_BROWSE 호출, 이벤트 발행을 하지 않는다.

## DIP / Port-Adapter

Application layer는 domain port에만 의존한다. Infrastructure adapter, JPA repository, HTTP client, 외부 SDK에 직접 의존하지 않는다.

| 대상 | Port | Adapter 예시 |
|------|------|--------------|
| BE_BROWSE 호출 | `BeBrowseClientPort` | `JdkHttpBeBrowseClientAdapter` |
| DB 저장소 | `CompanyRepositoryPort`, `QueueJobRepositoryPort` | `JpaCompanyRepositoryAdapter` |
| 이벤트 발행 | `QueueEventPublisherPort` | `SseQueueEventPublisher`, `RedisQueueEventPublisher` |
| 파일/artifact | `ArtifactStorePort` | `LocalArtifactStore`, `S3ArtifactStore` |
| 인증/토큰 | `TokenIssuerPort`, `PasswordHasherPort` | `JwtTokenIssuer`, `BCryptPasswordHasher` |
| 시간/ID | `ClockPort`, `IdGeneratorPort` | `SystemClockAdapter`, `UuidGenerator` |

추상화는 변화 가능성이 높은 경계에 우선 적용한다. 단순 내부 계산 클래스까지 무조건 interface를 만들지 않는다.

## AOP

횡단 관심사만 AOP로 분리한다. 비즈니스 분기 자체를 Aspect에 숨기지 않는다.

| 관심사 | 적용 위치 | 방식 |
|--------|-----------|------|
| Transaction | command/query use case | `@Transactional`, `readOnly=true` |
| Metrics | use case, BE_BROWSE adapter | `@Measured` Aspect + Actuator/Micrometer |
| Audit log | auth, queue, company/recruit 변경 command | `@Audited` Aspect |
| Idempotency | queue 생성, scraping 시작, 분석 시작 command | `@IdempotentCommand` Aspect |
| Retry/circuit breaker | BE_BROWSE adapter, 외부 API adapter | annotation 또는 adapter 내부 policy |
| Request tracing | web filter + use case MDC | Filter + Aspect 조합 |

인증은 Spring Security filter/method security를 사용한다. custom Aspect로 인증 흐름을 만들지 않는다.

## BE_BROWSE 비동기 호출

- Spring WebFlux는 사용하지 않는다. Spring MVC 기반으로 유지한다.
- BE_BROWSE 호출은 Java 21 virtual thread 기반 전용 executor에서 실행한다.
- 호출은 긴 작업 실행이 아니라 enqueue/status/result/cancel 요청이다.
- Spring request thread에서 긴 BE_BROWSE 작업을 직접 기다리지 않는다.
- Spring `QueueJob`을 만들고 BE_BROWSE `/v1/requests`에 enqueue한 뒤 `beBrowseRequestId`를 저장한다.
- Spring worker는 `beBrowseRequestId`로 상태/결과를 polling하거나 event stream을 수신한다.

구현 후보:

```java
@Configuration
public class BeBrowseClientConfig {
    @Bean(destroyMethod = "close")
    ExecutorService beBrowseExecutor() {
        return Executors.newVirtualThreadPerTaskExecutor();
    }

    @Bean
    HttpClient beBrowseHttpClient(ExecutorService beBrowseExecutor) {
        return HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_2)
                .executor(beBrowseExecutor)
                .connectTimeout(Duration.ofSeconds(3))
                .build();
    }
}
```

## Actuator

Phase 4에서 Spring Boot Actuator를 반드시 추가한다.

- 최소 endpoint: `/actuator/health`, `/actuator/info`, `/actuator/metrics`
- Health group: `liveness`, `readiness`
- k8s probe는 Actuator health group을 사용한다.

## 결합도 보호

느슨한 결합은 코드 리뷰 기준이 아니라 테스트와 빌드 규칙으로 강제한다. Spring BE는 ArchUnit 테스트를 추가한다.

규칙:

- Domain package는 Spring, JPA, Jackson, HTTP client, 외부 SDK에 의존하지 않는다.
- Application package는 infrastructure package를 import하지 않는다.
- Presentation DTO는 presentation 밖으로 전달하지 않는다.
- Infrastructure adapter는 domain port를 구현한다.
- 순환 의존은 금지한다.

ArchUnit 예시:

```java
@Test
void domain_should_not_depend_on_frameworks() {
    noClasses()
            .that().resideInAPackage("..domain..")
            .should().dependOnClassesThat().resideInAnyPackage(
                    "org.springframework..",
                    "jakarta.persistence..",
                    "com.fasterxml.jackson..",
                    "java.net.http.."
            )
            .check(importedClasses);
}

@Test
void application_should_not_depend_on_infrastructure() {
    noClasses()
            .that().resideInAPackage("..application..")
            .should().dependOnClassesThat().resideInAPackage("..infrastructure..")
            .check(importedClasses);
}

@Test
void presentation_dto_should_not_escape_presentation_layer() {
    noClasses()
            .that().resideOutsideOfPackage("..presentation..")
            .should().dependOnClassesThat().resideInAPackage("..presentation.dto..")
            .check(importedClasses);
}
```

## 이관 체크리스트

- [ ] Spring Boot 3 + Java 21 skeleton 생성
- [ ] DTO package와 변환 규칙 생성
- [ ] command/query use case 패키지 생성
- [ ] DIP port 목록 초안 작성
- [ ] AOP annotation과 aspect 초안 작성
- [ ] ArchUnit 결합도 보호 테스트 추가
- [ ] Actuator 추가
- [ ] BE_BROWSE client 추가
- [ ] Java 21 virtual thread executor 구성
- [ ] PostgreSQL + Flyway 기반 DB 전환
- [ ] auth/settings 이관
- [ ] queue orchestration 이관
- [ ] 화면 단위 domain API 이관
