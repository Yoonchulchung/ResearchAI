import { apiFetch } from "./api/base";

export interface RecruitSearchProgress {
  collected: number;
  running: boolean;
  keyword: string;
}

export interface RecruitSearchResult {
  collected: number;
  jobId: string;
}

const POLL_INTERVAL_MS = 800;

/**
 * 외부 채용 사이트에서 키워드(기업명 등)로 공고를 수집합니다.
 * - 이미 수집 중이면 현재 진행 중인 job에 합류해 폴링합니다.
 *
 * @example
 * const { collected } = await recruitSearch("아우모비스타");
 * const { collected } = await recruitSearch("삼성전자", {
 *   onProgress: ({ collected }) => console.log(`${collected}건 수집됨`),
 * });
 */
export async function recruitSearch(
  keyword: string,
  options?: {
    onProgress?: (progress: RecruitSearchProgress) => void;
    signal?: AbortSignal;
  },
): Promise<RecruitSearchResult> {
  // apiFetch가 envelope 자동 언래핑 + Content-Type 처리
  const startData = await apiFetch<{ ok: boolean; jobId?: string; message?: string }>(
    "/recruit/collect",
    {
      method: "POST",
      body: JSON.stringify({ keyword }),
      signal: options?.signal,
    },
  );

  // 이미 수집 중이고 jobId도 없으면 진행 불가
  if (!startData.jobId) {
    throw new Error(startData.message ?? "채용 공고 검색을 시작할 수 없습니다.");
  }

  // ok: false여도 jobId가 있으면 → 이미 진행 중인 job에 합류해 폴링
  const jobId = startData.jobId;

  return new Promise((resolve, reject) => {
    if (options?.signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    // eslint-disable-next-line prefer-const
    let timer: ReturnType<typeof setInterval>;

    const cleanup = () => clearInterval(timer);

    options?.signal?.addEventListener("abort", () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });

    const poll = async () => {
      try {
        const status = await apiFetch<{
          found: boolean;
          running?: boolean;
          collected?: number;
          keyword?: string;
        }>(`/recruit/collect/status/${jobId}`, { signal: options?.signal });

        if (!status.found) {
          cleanup();
          resolve({ collected: 0, jobId });
          return;
        }

        options?.onProgress?.({
          collected: status.collected ?? 0,
          running: status.running ?? false,
          keyword: status.keyword ?? keyword,
        });

        if (!status.running) {
          cleanup();
          resolve({ collected: status.collected ?? 0, jobId });
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        cleanup();
        reject(e);
      }
    };

    poll();
    timer = setInterval(poll, POLL_INTERVAL_MS);
  });
}
