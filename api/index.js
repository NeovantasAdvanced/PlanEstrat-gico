// Meraki · Comité de Liderazgo
// Recibe el envío del formulario y crea un elemento en una lista de SharePoint
// usando Microsoft Graph con permisos de aplicación (client credentials).
//
// Variables de entorno necesarias (se configuran en Azure Static Web Apps → Configuración):
//   AAD_TENANT_ID      Id. de directorio (inquilino)
//   AAD_CLIENT_ID      Id. de aplicación (cliente) del registro de Entra
//   AAD_CLIENT_SECRET  Valor del secreto de cliente
//   SP_HOSTNAME        p. ej. contoso.sharepoint.com
//   SP_SITE_PATH       ruta del sitio, p. ej. /sites/Comite   (raíz => usa "/")
//   SP_LIST_NAME       nombre de la lista, p. ej. Respuestas Meraki
//
// Requiere Node 18+ (fetch global). Sin dependencias externas.

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
  let path = process.env.SP_SITE_PATH || "/";
  if (!host) throw new Error("Falta SP_HOSTNAME");
  // /sites/{hostname}:{site-relative-path}   (para la raíz basta con {hostname})
  const url =
    path === "/" || path === ""
      ? `${GRAPH}/sites/${host}`
      : `${GRAPH}/sites/${host}:${path.startsWith("/") ? path : "/" + path}`;
  const data = await graphGet(token, url);
  return data.id; // id compuesto del sitio
}

async function resolveListId(token, siteId) {
  const listName = process.env.SP_LIST_NAME;
  if (!listName) throw new Error("Falta SP_LIST_NAME");
  const url = `${GRAPH}/sites/${siteId}/lists?$select=id,displayName&$filter=displayName eq '${encodeURIComponent(
    listName
  ).replace(/'/g, "''")}'`;
  const data = await graphGet(token, url);
  if (!data.value || data.value.length === 0) {
    throw new Error(`No se encontró la lista "${listName}" en el sitio`);
  }
  return data.value[0].id;
}

module.exports = async function (context, req) {
  const respond = (status, obj) => {
    context.res = {
      status,
      headers: { "Content-Type": "application/json" },
      body: obj,
    };
  };

  try {
    const b = req.body || {};
    const nombre = (b.nombre || "").toString().trim();
    const q1 = (b.q1 || "").toString().trim();
    const q2 = (b.q2 || "").toString().trim();
    const q3 = (b.q3 || "").toString().trim();
    const timestamp = (b.timestamp || new Date().toISOString()).toString();

    if (!nombre) return respond(400, { error: "Falta el nombre" });
    if (!q1 && !q2 && !q3)
      return respond(400, { error: "Responde al menos a una pregunta" });

    const token = await getGraphToken();
    const siteId = await resolveSiteId(token);
    const listId = await resolveListId(token, siteId);

    const createUrl = `${GRAPH}/sites/${siteId}/lists/${listId}/items`;
    const fields = {
      Title: nombre, // la columna "Título" siempre existe
      Pregunta1: q1,
      Pregunta2: q2,
      Pregunta3: q3,
      EnviadoEl: timestamp,
    };

    const r = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });

    if (!r.ok) {
      const t = await r.text();
      context.log.error(`Create item falló: ${r.status} ${t}`);
      return respond(502, { error: "No se pudo guardar en SharePoint" });
    }

    return respond(200, { ok: true });
  } catch (err) {
    context.log.error(err.message || err);
    return respond(500, { error: "Error interno al guardar la respuesta" });
  }
};
