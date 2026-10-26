// Verifica las credenciales de Microsoft Graph y lista los roles concedidos al token.
// Uso: node --env-file=.env.local scripts/check-graph.mjs
const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = process.env;
if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
  console.error("Faltan AZURE_TENANT_ID, AZURE_CLIENT_ID o AZURE_CLIENT_SECRET en .env.local");
  process.exit(1);
}

const res = await fetch(`https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: AZURE_CLIENT_ID,
    client_secret: AZURE_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  }),
});
const data = await res.json();
if (!res.ok) {
  console.error("Error obteniendo token:", data.error, data.error_description);
  process.exit(1);
}

const payload = JSON.parse(Buffer.from(data.access_token.split(".")[1], "base64url").toString());
console.log("Token obtenido. Roles concedidos:", payload.roles ?? "(ninguno; falta el consentimiento de administrador)");
