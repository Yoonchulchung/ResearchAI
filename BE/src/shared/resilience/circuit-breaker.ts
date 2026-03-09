import {
  circuitBreaker,
  retry,
  handleAll,
  wrap,
  ExponentialBackoff,
  ConsecutiveBreaker,
  IPolicy,
} from 'cockatiel';

const circuitBreakerPolicies = new Map<string, IPolicy>();

/**
 * 서비스별 서킷브레이커 + 재시도 정책을 반환한다.
 * 동일한 서비스명으로 호출하면 같은 인스턴스를 재사용하므로
 * 연속 실패 횟수가 인스턴스 간에 공유된다.
 *
 * 기본 동작:
 * - 최대 2회 재시도 (초기 요청 포함 총 3회), 지수 백오프
 * - 연속 5회 실패 시 서킷 OPEN
 * - 10초 후 HALF-OPEN 전환, 성공 시 CLOSED 복구
 */
export function getCircuitBreaker(service: string): IPolicy {
  if (circuitBreakerPolicies.has(service)) {
    return circuitBreakerPolicies.get(service)!;
  }

  const retryPolicy = retry(handleAll, {
    maxAttempts: 2,
    backoff: new ExponentialBackoff({ initialDelay: 300, maxDelay: 3000 }),
  });

  const cbPolicy = circuitBreaker(handleAll, {
    halfOpenAfter: 10_000,
    breaker: new ConsecutiveBreaker(5),
  });

  const policy = wrap(retryPolicy, cbPolicy);
  circuitBreakerPolicies.set(service, policy);
  return policy;
}
