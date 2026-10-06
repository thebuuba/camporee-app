import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const recovery = type === "recovery" || searchParams.get("next") === "recovery";
  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = "/";
  redirectTo.search = "";
  if (recovery) { redirectTo.pathname = "/login"; redirectTo.searchParams.set("reset", "1"); }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(redirectTo);
  }

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(redirectTo);
  }

  redirectTo.pathname = "/login";
  redirectTo.search = "";
  redirectTo.searchParams.set("error", "No pudimos confirmar el correo.");
  return NextResponse.redirect(redirectTo);
}
