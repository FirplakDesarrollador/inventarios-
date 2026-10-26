import "server-only";

// Acceso app-only a Microsoft Graph (client credentials) para leer los Excel de SharePoint.
// La app registrada en Entra ID necesita el permiso de aplicación Sites.Read.All
// (o Sites.Selected con acceso concedido al sitio) y consentimiento de administrador.
const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Faltan AZURE_TENANT_ID, AZURE_CLIENT_ID o AZURE_CLIENT_SECRET en el entorno");
  }

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Error obteniendo token de Graph ${res.status}: ${await res.text()}`);
  }

  const data: { access_token: string; expires_in: number } = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

async function graphRequest(path: string) {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Microsoft Graph ${path} respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res;
}

export async function graphFetch<T>(path: string): Promise<T> {
  return (await graphRequest(path)).json();
}

// Contenido binario (p. ej. /items/{id}/content para descargar un archivo).
export async function graphFetchBuffer(path: string): Promise<Buffer> {
  return Buffer.from(await (await graphRequest(path)).arrayBuffer());
}
