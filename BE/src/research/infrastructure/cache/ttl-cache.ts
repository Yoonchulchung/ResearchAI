const TTL_MS = 60_000; // 60초 캐시

export function makeCache<T>() {
  let value: T | null = null;
  let expireAt = 0;
  return {
    get: () => (Date.now() < expireAt ? value : null),
    set: (v: T) => { value = v; expireAt = Date.now() + TTL_MS; },
    invalidate: () => { value = null; expireAt = 0; },
  };
}
