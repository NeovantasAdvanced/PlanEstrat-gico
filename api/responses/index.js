// Meraki · Comité de Liderazgo — GET /api/responses
// Devuelve todas las respuestas guardadas en la lista de SharePoint.
// El acceso se restringe al rol "revisor" en staticwebapp.config.json.

const { GRAPH, getGraphToken, graphGet, resolveSiteId, resolveListId } = require("../shared/graph");

module.exports = async function (context, req) {
  const respond = (status, obj) => {
    context.res = { status, headers: { "Content-Type": "application/json" }, body: obj };
  };

  try {
    const token = await getGraphToken();
    const siteId = await resolveSiteId(token);
    const listId = await resolveListId(token, siteId);

    let url =
      `${GRAPH}/sites/${siteId}/lists/${listId}/items` +
      `?expand=fields($select=Title,Pregunta1,Pregunta2,Pregunta3,EnviadoEl)&$top=200`;

    const items = [];
    let guard = 0;
    while (url && guard < 20) {
      const data = await graphGet(token, url);
      for (const it of data.value || []) {
        const f = it.fields || {};
        items.push({
          nombre: f.Title || "",
          q1: f.Pregunta1 || "",
          q2: f.Pregunta2 || "",
          q3: f.Pregunta3 || "",
          timestamp: f.EnviadoEl || it.createdDateTime || "",
        });
      }
      url = data["@odata.nextLink"] || null;
      guard++;
    }

    items.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    return respond(200, { count: items.length, items });
  } catch (err) {
    context.log.error(err.message || err);
    return respond(500, { error: "No se pudieron leer las respuestas" });
  }
};
