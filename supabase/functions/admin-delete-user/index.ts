// The legacy endpoint deleted or disabled an Auth account globally, which is
// unsafe for multi-organization users. Membership removal must use the
// organization-scoped remove_organization_member RPC instead.
//
// Keep this function as a non-destructive tombstone until the deployed Edge
// Function and all old clients have been retired.
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  return new Response(JSON.stringify({
    error: "Esta operación global ya no está disponible. Retira al usuario desde la organización correspondiente.",
    code: "LEGACY_GLOBAL_DELETE_DISABLED",
  }), { status: 410, headers });
});
