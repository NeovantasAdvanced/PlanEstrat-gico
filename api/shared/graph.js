// Utilidades compartidas de Microsoft Graph (token de aplicación + resolución de sitio/lista).
// Requiere Node 18+ (fetch global). Variables de entorno: AAD_TENANT_ID, AAD_CLIENT_ID,
// AAD_CLIENT_SECRET, SP_HOSTNAME, SP_SITE_PATH, SP_LIST_NAME.

const GRAPH = "https://graph.microsoft.com/v1.0";

async function getGraphToken() {
  const tenant = process.env.AAD_TENANT_ID;
  const clientId = process.env.AAD_CLIENT_ID;
  const clientSecret = process.env.AAD_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) {
    throw new Error("Faltan AAD_TENANT_ID / AAD_CLIENT_ID / AAD_CLIENT_SECRET");
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const r = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`No se pudo obtener token de Graph (${r.status}): ${t}`);
  }
  return (await r.json()).access_token;
}

async function graphGet(token, url) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Graph GET ${url} → ${r.status}: ${t}`);
  }
  return r.json();
}

async function resolveSiteId(token) {
  const host = process.env.SP_HOSTNAME;
  const path = process.env.SP_SITE_PATH || "/";
  if (!host) throw new Error("Falta SP_HOSTNAME");
  const url =
    path === "/" || path === ""
      ? `${GRAPH}/sites/${host}`
      : `${GRAPH}/sites/${host}:${path.startsWith("/") ? path : "/" + path}`;
  const data = await graphGet(token, url);
  return data.id;
}

async function resolveListId(token, siteId) {
  const listName = process.env.SP_LIST_NAME;
  if (!listName) throw new Error("Falta SP_LIST_NAME");
  const filter = encodeURIComponent(listName).replace(/'/g, "''");
  const url = `${GRAPH}/sites/${siteId}/lists?$select=id,displayName&$filter=displayName eq '${filter}'`;
  const data = await graphGet(token, url);
  if (!data.value || data.value.length === 0) {
    throw new Error(`No se encontró la lista "${listName}" en el sitio`);
  }
  return data.value[0].id;
}

module.exports = { GRAPH, getGraphToken, graphGet, resolveSiteId, resolveListId };
