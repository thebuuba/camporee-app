import { createBrowserClient } from "@supabase/ssr";
import { camporeeFetch } from "@/lib/offline-fetch";
import { withSupabaseRetry } from "@/lib/supabase/retry-fetch";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;
const supabaseFetch = withSupabaseRetry(camporeeFetch);

export function createClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { global: { fetch: supabaseFetch } }
  );
  return browserClient;
}
