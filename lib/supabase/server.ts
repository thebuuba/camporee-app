import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withSupabaseRetry } from "@/lib/supabase/retry-fetch";

const supabaseFetch = withSupabaseRetry(fetch);

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { fetch: supabaseFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
          cookiesToSet.forEach(({ name, value, options }) => {
            const sessionOnly = cookieStore.get("camporee-remember")?.value === "no" && options.maxAge !== 0;
            cookieStore.set(name, value, sessionOnly ? { ...options, maxAge: undefined, expires: undefined } : options);
          });
          } catch {
            // Server Components cannot always mutate cookies. proxy.ts refreshes sessions.
          }
        },
      },
    }
  );
}
