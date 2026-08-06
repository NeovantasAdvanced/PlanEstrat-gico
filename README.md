# Meraki · Comité de Liderazgo — Guía de publicación

Este repositorio contiene una página estática (`index.html`) con el resumen ejecutivo de Meraki y el
formulario de las tres preguntas. Esta guía explica cómo publicarla con una URL propia, restringir el
acceso a las personas de vuestra organización y guardar las respuestas de forma segura y duradera,
aprovechando las licencias de Microsoft 365 / Azure.

---

## 0. Qué cambia respecto a la versión de vista previa

La versión que se previsualizaba dentro de Claude guardaba las respuestas con un almacenamiento interno
del propio entorno de Claude (`window.storage`). **Ese almacenamiento no existe fuera de Claude**, así que
esta versión para publicar envía cada respuesta a un destino real que tú configuras (un flujo de Power
Automate que las escribe en una lista de SharePoint). Hasta que no lo configures (paso 4), el botón de
enviar avisará de que falta la conexión.

Arquitectura recomendada:

- **Hosting:** Azure Static Web Apps (plan gratuito), desplegado automáticamente desde GitHub.
- **Acceso restringido:** autenticación con Entra ID (el mismo login de Microsoft 365). Solo entra quien
  tú autorices; el resto ni siquiera ve la página.
- **Almacenamiento de respuestas:** un flujo de Power Automate recibe cada envío y crea una fila en una
  lista de SharePoint. Solo quien tenga permiso sobre esa lista ve las respuestas, y quedan guardadas de
  forma permanente.

---

## 1. Subir el proyecto a GitHub

1. Crea un repositorio nuevo en GitHub (privado). Por ejemplo `meraki-comite`.
2. Sube estos archivos a la raíz del repositorio:
   - `index.html`
   - `staticwebapp.config.json`
   - `README.md` (este archivo)
3. Puedes hacerlo desde la web de GitHub ("Add file" → "Upload files") o con git:
   ```bash
   git init
   git add .
   git commit -m "Meraki comité - versión inicial"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/meraki-comite.git
   git push -u origin main
   ```

---

## 2. Desplegar en Azure Static Web Apps

1. Entra en el portal de Azure (https://portal.azure.com) con tu cuenta corporativa.
2. Busca **Static Web Apps** → **Crear**.
3. Rellena:
   - **Plan:** Free.
   - **Origen del despliegue:** GitHub. Autoriza y elige el repositorio y la rama `main`.
   - **Build presets:** *Custom*.
   - **App location:** `/`  (la raíz, donde está `index.html`).
   - **Api location:** *(déjalo vacío)*.
   - **Output location:** *(déjalo vacío)*.
4. Al crear el recurso, Azure añade un workflow de GitHub Actions al repo y publica el sitio en unos
   minutos. Obtendrás una URL del tipo `https://<algo-aleatorio>.azurestaticapps.net`.

Cada vez que hagas cambios en `main`, el sitio se vuelve a publicar solo.

---

## 3. Restringir el acceso a tu organización (Entra ID)

El archivo `staticwebapp.config.json` ya obliga a iniciar sesión para ver cualquier página
(`allowedRoles: ["authenticated"]`) y redirige al login de Entra ID. Para que **solo entre gente de tu
organización** (y no cualquier cuenta Microsoft del mundo), registra una aplicación en Entra ID:

1. Portal de Azure → **Microsoft Entra ID** → **Registros de aplicaciones** → **Nuevo registro**.
   - Nombre: `Meraki Comité`.
   - Tipos de cuenta admitidos: *Solo cuentas de este directorio organizativo* (un inquilino).
   - URI de redirección (tipo *Web*): `https://<TU-URL>.azurestaticapps.net/.auth/login/aad/callback`
2. Copia el **Id. de aplicación (cliente)** y el **Id. de directorio (inquilino)**.
3. En **Certificados y secretos** → crea un **secreto de cliente** y copia su valor.
4. En `staticwebapp.config.json`, sustituye `REEMPLAZA_TENANT_ID` por tu Id. de inquilino y sube el cambio.
5. En el recurso Static Web App → **Configuración** (variables de entorno), añade:
   - `AAD_CLIENT_ID` = Id. de aplicación (cliente).
   - `AAD_CLIENT_SECRET` = valor del secreto.

Con esto, al abrir la URL cualquiera deberá iniciar sesión con su cuenta corporativa; quien no sea de la
organización no podrá entrar.

**Opcional — limitar a personas concretas:** si además quieres que solo un grupo reducido acceda (no toda
la empresa), en el recurso Static Web App → **Role management** puedes invitar por correo a usuarios
concretos y asignarles un rol; luego cambia en `staticwebapp.config.json` el `allowedRoles` de
`"authenticated"` por el nombre de ese rol (por ejemplo `"comite"`).

---

## 4. Guardar las respuestas (Power Automate + SharePoint)

Esta es la parte que asegura que las respuestas **no se pierden** y **solo las ve quien tú decidas**.

### 4.1. Crear la lista de SharePoint

1. En un sitio de SharePoint de tu organización, crea una **lista** llamada `Respuestas Meraki`.
2. Añade columnas de texto (tipo *Varias líneas de texto* para las respuestas):
   - `Nombre` (una línea)
   - `Pregunta1` (varias líneas)
   - `Pregunta2` (varias líneas)
   - `Pregunta3` (varias líneas)
   - `EnviadoEl` (una línea, o tipo Fecha/hora)
3. Los permisos de esa lista/sitio determinan quién ve las respuestas: deja acceso solo a ti y a quien
   corresponda.

### 4.2. Crear el flujo de Power Automate

1. Ve a https://make.powerautomate.com → **Crear** → **Flujo de nube instantáneo**.
2. Como desencadenador elige **"Cuando se recibe una solicitud HTTP"** (When an HTTP request is received).
3. En el cuerpo de la solicitud (*Request Body JSON Schema*) pega este esquema:
   ```json
   {
     "type": "object",
     "properties": {
       "nombre":    { "type": "string" },
       "q1":        { "type": "string" },
       "q2":        { "type": "string" },
       "q3":        { "type": "string" },
       "timestamp": { "type": "string" },
       "origen":    { "type": "string" }
     }
   }
   ```
4. Añade una acción **SharePoint → Crear elemento** (*Create item*), elige tu sitio y la lista
   `Respuestas Meraki`, y mapea:
   - `Nombre` → `nombre`
   - `Pregunta1` → `q1`
   - `Pregunta2` → `q2`
   - `Pregunta3` → `q3`
   - `EnviadoEl` → `timestamp`
5. (Recomendado) Añade una acción final **Respuesta** (*Response*) con código 200 para confirmar.
6. Guarda. Al guardar, el desencadenador muestra una **HTTP POST URL**: cópiala.

### 4.3. Conectar el formulario

Abre `index.html`, busca cerca del final la línea:

```js
const SUBMIT_ENDPOINT = "";
```

y pega dentro de las comillas la **HTTP POST URL** del flujo. Sube el cambio a GitHub; el sitio se
republica solo. A partir de ahí, cada envío del formulario crea una fila en tu lista de SharePoint.

Para leer las respuestas, abre la lista `Respuestas Meraki` en SharePoint (puedes exportarla a Excel con
un clic para elaborar el plan). No hay ninguna página pública que muestre las respuestas.

---

## 5. (Opcional) Dominio propio

En el recurso Static Web App → **Custom domains** puedes añadir un subdominio vuestro
(p. ej. `comite.neovantas.com`) y Azure gestiona el certificado HTTPS.

---

## Notas de seguridad

- La URL del flujo de Power Automate permite **escribir** respuestas (no leerlas). Como el sitio está
  detrás del login de Entra ID, en la práctica solo la usan las personas autorizadas. Si en algún momento
  quisieras invalidarla, basta con regenerar el desencadenador del flujo y actualizar `SUBMIT_ENDPOINT`.
- Las respuestas viven en SharePoint, gobernadas por los permisos de tu organización y con el respaldo /
  versionado propio de Microsoft 365: no dependen de este sitio ni se pierden si lo despublicas.
- No publiques el repositorio como público con `SUBMIT_ENDPOINT` relleno; mantén el repo **privado**.
