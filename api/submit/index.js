// Meraki · Comité de Liderazgo — POST /api/submit
// Recibe el envío del formulario y crea un elemento en la lista de SharePoint vía Microsoft Graph.

const { GRAPH, getGraphToken, resolveSiteId, resolveListId } = require("../shared/graph");

module.exports = async function (context, req) {
  const respond = (status, obj) => {
    context.res = { status, headers: { "Content-Type": "application/json" }, body: obj };
  };

  try {
    const b = req.body || {};
    const nombre = (b.nombre || "").toString().trim();
    const q1 = (b.q1 || "").toString().trim();
    const q2 = (b.q2 || "").toString().trim();
    const q3 = (b.q3 || "").toString().trim();
    const timestamp = (b.timestamp || new Date().toISOString()).toString();

    if (!nombre) return respond(400, { error: "Falta el nombre" });
    if (!q1 && !q2 && !q3) return respond(400, { error: "Responde al menos a una pregunta" });

    const token = await getGraphToken();
    const siteId = await resolveSiteId(token);
    const listId = await resolveListId(token, siteId);

    const fields = {
      Title: nombre, // la columna "Título" siempre existe
      Pregunta1: q1,
      Pregunta2: q2,
      Pregunta3: q3,
      EnviadoEl: timestamp,
    };

    const r = await fetch(`${GRAPH}/sites/${siteId}/lists/${listId}/items`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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
