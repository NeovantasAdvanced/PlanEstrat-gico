# Meraki · Comité de Liderazgo — Guía de publicación (SharePoint vía Microsoft Graph)

Página estática con el resumen ejecutivo de Meraki y el formulario de las tres preguntas. Esta versión se
publica en **Azure Static Web Apps**, restringe el acceso a tu organización con **Entra ID** y guarda cada
respuesta **directamente en una lista de SharePoint** mediante una pequeña **función de Azure** que usa
**Microsoft Graph**. No usa Power Automate ni ningún servicio externo.

## Contenido del repositorio

```
index.html                 la página (resumen + formulario)
resultados.html            panel para revisar las respuestas (solo rol "revisor")
staticwebapp.config.json   login con Entra ID + protección por roles
README.md                  esta guía
api/
  host.json
  package.json
  shared/
    graph.js               utilidades comunes de Microsoft Graph
  submit/
    function.json          ruta POST /api/submit (escribe una respuesta)
    index.js
  responses/
    function.json          ruta GET /api/responses (lee las respuestas, solo "revisor")
    index.js
```

El formulario llama a `/api/submit` y el panel a `/api/responses`, así que no hay que editar ninguna URL
en el HTML.

---

## Cómo funciona (resumen)

1. La persona abre la URL → Entra ID le pide iniciar sesión con su cuenta corporativa.
2. Rellena el formulario y pulsa enviar → el navegador hace `POST /api/submit`.
3. La función de Azure obtiene un token de aplicación de Graph, localiza tu sitio y lista de SharePoint, y
   crea una fila con la respuesta.
4. Tú lees las respuestas en la lista de SharePoint (o la exportas a Excel).

No existe ninguna página ni endpoint público que muestre las respuestas: solo se leen desde SharePoint,
con los permisos de tu organización.

---

## Paso a paso

### Fase 1 — Subir el proyecto a GitHub

1. Crea un repositorio **privado** en GitHub (p. ej. `meraki-comite`).
2. Sube **toda la estructura** de archivos anterior (incluida la carpeta `api/`) a la raíz.
   - Desde la web: "Add file" → "Upload files" y arrastra la carpeta.
   - O con git:
     ```bash
     git init
     git add .
     git commit -m "Meraki comité - versión inicial"
     git branch -M main
     git remote add origin https://github.com/TU_USUARIO/meraki-comite.git
     git push -u origin main
     ```

Comprobación: en el repo ves `index.html`, `staticwebapp.config.json` y la carpeta `api/`.

### Fase 2 — Crear la lista de SharePoint

1. En un sitio de SharePoint de tu organización, "Nuevo" → "Lista" → "Lista en blanco". Nómbrala
   **`Respuestas Meraki`** (este nombre debe coincidir con la variable `SP_LIST_NAME` de la fase 5).
2. Configura estas columnas (los nombres deben coincidir **exactamente**):
   - La columna **Título** ya existe: se usará para el nombre de la persona (no la borres).
   - `Pregunta1` — tipo *Varias líneas de texto*.
   - `Pregunta2` — tipo *Varias líneas de texto*.
   - `Pregunta3` — tipo *Varias líneas de texto*.
   - `EnviadoEl` — tipo *Una línea de texto* (o Fecha y hora).
3. Ajusta los permisos del sitio/lista para que solo tú y quien deba leer las respuestas tengan acceso.
4. Anota dos datos de la URL del sitio: el **host** (p. ej. `contoso.sharepoint.com`) y la **ruta del
   sitio** (p. ej. `/sites/Comite`). Los necesitarás en la fase 5.

### Fase 3 — Desplegar en Azure Static Web Apps

1. En `portal.azure.com`: busca **Static Web Apps** → "Crear".
2. Suscripción y Grupo de recursos (crea uno, p. ej. `rg-meraki`). Nombre: `meraki-comite`. Plan: **Free**.
   Región cercana (p. ej. West Europe).
3. Origen del despliegue: **GitHub** → autoriza → elige el repo y la rama `main`.
4. Detalles de compilación: Build Presets = **Custom**. **App location** = `/`. **Api location** = `api`.
   **Output location** = *(vacío)*.
5. "Revisar y crear" → "Crear". En unos minutos tendrás una URL `https://<...>.azurestaticapps.net`.
   Cópiala.

Comprobación: la URL abre la página (todavía sin login; se activa en la fase 4).

### Fase 4 — Restringir el acceso a tu organización (Entra ID)

1. Portal → **Microsoft Entra ID** → "Registros de aplicaciones" → "Nuevo registro".
   - Nombre: `Meraki Comité`.
   - Tipos de cuenta: **Solo cuentas de este directorio organizativo**.
   - URI de redirección (tipo *Web*):
     `https://<TU-URL>.azurestaticapps.net/.auth/login/aad/callback`
2. Copia el **Id. de aplicación (cliente)** y el **Id. de directorio (inquilino)**.
3. "Certificados y secretos" → "Nuevo secreto de cliente" → copia **el valor** (no el Id.).
4. En el repo, edita `staticwebapp.config.json` y sustituye `REEMPLAZA_TENANT_ID` por tu Id. de inquilino.
   Sube el cambio.

Comprobación: en incógnito, la URL pide iniciar sesión y, tras entrar con tu cuenta corporativa, muestra la
página con "Sesión: tu@correo" arriba a la derecha.

### Fase 5 — Permisos de Graph y variables de entorno

La misma app de Entra que usas para el login se usará para que la función escriba en SharePoint.

**5.1. Dar permiso de aplicación a la app**

1. En tu registro `Meraki Comité` → "Permisos de API" → "Agregar un permiso" → **Microsoft Graph** →
   **Permisos de aplicación**.
2. Recomendado (mínimo privilegio): añade **`Sites.Selected`**.
   *(Alternativa más simple pero más amplia: `Sites.ReadWrite.All`, que da acceso a todos los sitios; si la
   eliges, salta el paso 5.2.)*
3. Pulsa **"Conceder consentimiento de administrador"** (lo hace un administrador global).

**5.2. Autorizar la app SOLO en tu sitio (si elegiste `Sites.Selected`)**

Con `Sites.Selected` hay que conceder acceso de escritura a ese sitio concreto. La forma más rápida es con
**Graph Explorer** (`https://developer.microsoft.com/graph/graph-explorer`), iniciando sesión como
administrador:

1. Primero obtén el `siteId`. Ejecuta un `GET`:
   ```
   GET https://graph.microsoft.com/v1.0/sites/<HOST>:/sites/<NOMBRE_SITIO>
   ```
   (p. ej. `.../sites/contoso.sharepoint.com:/sites/Comite`). Copia el campo `id` de la respuesta.
2. Concede acceso de escritura a tu app con un `POST`:
   ```
   POST https://graph.microsoft.com/v1.0/sites/<SITE_ID>/permissions
   Content-Type: application/json

   {
     "roles": ["write"],
     "grantedToIdentities": [
       { "application": { "id": "<APP_CLIENT_ID>", "displayName": "Meraki Comité" } }
     ]
   }
   ```

**5.3. Variables de entorno de la función**

En el recurso Static Web App → "Configuración" (variables de entorno de la aplicación), añade:

| Nombre              | Valor                                             |
|---------------------|---------------------------------------------------|
| `AAD_TENANT_ID`     | Id. de directorio (inquilino)                     |
| `AAD_CLIENT_ID`     | Id. de aplicación (cliente)  *(ya creada en fase 4)* |
| `AAD_CLIENT_SECRET` | valor del secreto  *(ya creado en fase 4)*        |
| `SP_HOSTNAME`       | p. ej. `contoso.sharepoint.com`                   |
| `SP_SITE_PATH`      | p. ej. `/sites/Comite`  (si es la raíz, pon `/`)  |
| `SP_LIST_NAME`      | `Respuestas Meraki`                               |

Guarda. La app se reinicia sola.

Comprobación final: abre la URL, inicia sesión, rellena el formulario y envíalo. Debe aparecer
"Respuestas recibidas" y, en la lista `Respuestas Meraki` de SharePoint, una fila nueva con los datos.

### Fase 6 — Página de resultados (solo revisores)

La página `resultados.html` muestra todas las respuestas y permite buscarlas y exportarlas a CSV. Se sirve
en `https://<TU-URL>/resultados.html`. Los datos que consume (`/api/responses`) están restringidos al rol
**`revisor`**: cualquiera de la organización puede abrir la página, pero solo quien tenga ese rol verá las
respuestas; al resto le aparece "No tienes permiso".

Para dar el rol a las personas que deban revisar (p. ej. tú y quien elabore el plan):

1. Recurso Static Web App → **Role management** → **Invite**.
2. Introduce el correo de la persona, elige el proveedor Entra ID y en "Roles" escribe **`revisor`**.
3. Genera el enlace de invitación y envíaselo; al aceptarlo queda con ese rol.

*(Alternativa escalable: en lugar de invitaciones, puedes definir un "app role" `revisor` en el registro de
Entra y asignarlo a un grupo; para un comité reducido, las invitaciones son más rápidas.)*

Quien tenga el rol verá además un enlace directo **"Ver resultados"** en la cabecera del propio formulario.

Comprobación: entra con una cuenta con rol `revisor` y abre `/resultados.html`; deben aparecer las
respuestas enviadas. Con una cuenta sin el rol, la página carga pero indica que no hay permiso.

### Fase 7 — (Opcional) Dominio propio

Recurso Static Web App → "Custom domains" → añade p. ej. `comite.neovantas.com`. Azure gestiona el
certificado HTTPS. Si lo haces, actualiza también la URI de redirección de la fase 4 con el nuevo dominio.

---

## Leer las respuestas

Tienes dos formas, ambas restringidas:

- **Panel web** (`/resultados.html`): cómodo para revisar durante el trabajo del comité, con búsqueda y
  botón de exportar a CSV. Solo accesible con el rol `revisor` (ver fase 6).
- **SharePoint**: abre la lista `Respuestas Meraki` y usa "Exportar → Exportar a Excel". Es el origen de
  verdad de los datos, gobernado por los permisos de tu organización y respaldado por Microsoft 365; no
  depende del sitio ni se pierde si lo despublicas.

## Notas de seguridad

- `/api/submit` solo escribe y está detrás del login de Entra ID (solo lo invoca quien ya ha iniciado
  sesión). `/api/responses` solo lee y además exige el rol `revisor`, así que las respuestas no son visibles
  para todo el que rellena el formulario.
- Con `Sites.Selected`, la app solo puede escribir en el sitio que autorizaste, no en todo SharePoint.
- Mantén el repositorio **privado**. El secreto de cliente vive en la configuración de Azure, nunca en el
  código del repo.

## Resolución de problemas

- **El envío falla con error 500/502:** revisa que las 6 variables de entorno estén bien escritas y que la
  app tenga consentimiento de administrador. En el recurso Static Web App puedes ver los logs de la función.
- **"No se encontró la lista":** `SP_LIST_NAME` debe coincidir exactamente con el nombre de la lista.
- **"403 / acceso denegado" al crear el elemento:** falta el paso 5.2 (autorizar la app en el sitio) o el
  consentimiento de administrador del paso 5.1.
- **Los nombres de columna no coinciden:** si creaste las columnas con otro nombre, ajústalas para que sean
  `Pregunta1`, `Pregunta2`, `Pregunta3` y `EnviadoEl`, o edita esos nombres en `api/submit/index.js`.
