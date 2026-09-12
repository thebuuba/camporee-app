const RETRYABLE_STATUSES = new Set([504, 544]);
const RETRYABLE_METHODS = new Set(["GET", "HEAD"]);
const MAX_RETRIES = 2;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function withSupabaseRetry(fetcher: typeof fetch): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    let response = await fetcher(input, init);

    for (let attempt = 0; RETRYABLE_METHODS.has(method) && RETRYABLE_STATUSES.has(response.status) && attempt < MAX_RETRIES; attempt += 1) {
      await response.arrayBuffer();
      await wait(150 * 2 ** attempt);
      response = await fetcher(input, init);
    }

    return response;
  };
}
