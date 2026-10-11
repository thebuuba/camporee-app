// A registration no longer belongs to a global camporee. The old handler
// notified global app_members administrators of every new account, exposing
// names and emails outside the user's organization.
//
// Access decisions and notifications must instead be addressed to admins of
// the specific organization AFTER a valid invitation or membership request.
const jsonHeaders = { "Content-Type": "application/json" };

Deno.serve((_req: Request) => new Response(JSON.stringify({
  code: "GLOBAL_SIGNUP_ALERT_DISABLED",
  error: "Los avisos globales de registros se han desactivado para proteger los datos de cada organización.",
}), { status: 410, headers: jsonHeaders }));
