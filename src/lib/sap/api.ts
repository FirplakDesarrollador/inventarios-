// API interna (FastAPI) que expone consultas de SQL Server de SAP a través de un túnel de Cloudflare.
// La URL del túnel cambia cuando se reinicia cloudflared: se actualiza en API_SAP_URL, no en el código.
export async function fetchApiSap<T = Record<string, unknown>>(
  path: string,
  timeoutMs = 120000,
): Promise<T[]> {
  const baseUrl = process.env.API_SAP_URL;
  const apiKey = process.env.API_SAP_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("Faltan las variables API_SAP_URL o API_SAP_KEY");
  }

  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
    headers: { "api-key": apiKey },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API SAP ${path} respondió ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`API SAP ${path} devolvió error: ${data.message}`);
  }
  return data.response ?? [];
}
