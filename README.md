# Nexo — Sitio web + CRM para negocios de multiservicios

Producto listo para vender a un negocio de multiservicios (taxes, LLC, notaría, documentos migratorios, reparación de crédito y contabilidad).
Incluye un **sitio web público** y un **panel CRM** conectados entre sí, con diseño **monocromático** (negro, blanco y grises) y animaciones.

Funciona como **demostración completa sin servidor y sin credenciales**: todo corre en el navegador con datos de ejemplo.

## Probarlo

Es un sitio estático: no necesita instalar nada.

```bash
npx http-server -p 8080 .      # o cualquier servidor estático
```

| Página | Ruta |
| --- | --- |
| Sitio web | `/` |
| Panel CRM | `/admin/` — acceso libre: cualquier correo y contraseña, o «Entrar a la demo sin cuenta» |
| Portal del cliente | `/portal/` — entra con cualquier correo (por ejemplo `maria.gonzalez@example.com`) |
| Reserva de citas | `/citas/` |
| Formularios | `/f/?s=taxes`, `/f/?s=llc`, `/formularios/inicio/` (crédito) |
| Firma de contratos, recibos y pagos | `/firmar/`, `/recibo/`, `/pago/` (se abren desde el panel) |

Todo está conectado: un mensaje enviado desde el sitio, una cita reservada o un contrato firmado aparecen en el panel (incluso abierto en otra pestaña, con aviso).
El botón **Restablecer** del menú lateral vuelve a los datos de ejemplo.

## Módulos del CRM

- **Inicio**: indicadores, pendientes del día, embudo de ventas, ingresos de 6 meses, oportunidades de venta.
- **Solicitudes**: formulario de crédito, otros formularios y mensajes del sitio; convertir en cliente con un clic.
- **Formularios**: editor de formularios con plantillas (taxes, LLC, inmigración, notaría, contabilidad), vista previa en vivo y enlace para compartir.
- **Clientes**: ficha con casos, tareas, cobros, notas, referidos, portal, contratos con firma electrónica, cobros mensuales y documentos.
- **Casos**: tablero por etapas con arrastrar y soltar para cada servicio; crédito con puntajes, gráfica y disputas por ronda; taxes; checklist de documentos.
- **Mensajes**: bandeja única de WhatsApp, Instagram y Messenger, etapas de prospecto, asistente con IA, cola de envíos, respuestas rápidas y automatizaciones.
- **Llamadas**: marcador, historial, grabaciones y resumen con IA de cada llamada.
- **Agenda**, **Tareas**, **Cobros** (métodos de pago, saldos, enlaces de pago con tarjeta y recibos en PDF), **Documentos**.
- **Campañas** por etiqueta y servicio, **Sitio web** (precios, anuncio, testimonios y preguntas que se publican al instante), **Contenido** (aprobación de diseños con calendario).
- **Equipo** con roles y permisos por sección, y **Ajustes** del negocio, horarios y listas de documentos.

En la demostración, las integraciones (WhatsApp, Meta, pagos con tarjeta, llamadas e IA) están **simuladas**: los mensajes reciben respuesta, la IA analiza las conversaciones, las llamadas se graban y se resumen, y los enlaces de pago abren una pantalla de pago de prueba.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `assets/js/config.js` | **Datos de la marca**: nombre, teléfono, WhatsApp, correo, ciudad, zona horaria |
| `assets/js/backend.js` | Backend local: imita la API de Supabase y guarda los datos en el navegador (localStorage + IndexedDB). Contiene los datos de ejemplo (`sembrar`) |
| `assets/js/efectos.js` | Animaciones del panel: números que cuentan, brillo que sigue al cursor, ondas en botones |
| `assets/js/main.js`, `sitio-publico.js` | Sitio público: intro, animaciones al hacer scroll, idioma ES/EN, contenido editable desde el panel y formulario de contacto |
| `assets/js/admin/*.js` | Un archivo por módulo del CRM (`core.js` es el núcleo) |
| `assets/css/sitio.css` | Estilos del sitio público |
| `assets/css/styles.css`, `admin.css`, `publico.css`, `mono.css` | Estilos base, panel, páginas públicas y la capa monocromática con animaciones del panel |
| `assets/img/` | Logotipo (`logo.svg`, `logo-light.svg`), isotipo, favicons e imagen para redes (`og-image.jpg`) |

## Personalizar para un cliente

1. **Marca**: edita `assets/js/config.js`. Los textos fijos de las páginas HTML usan los mismos valores de ejemplo: busca y reemplaza `Nexo`, `Nexo Multiservicios`, `(713) 555-0147`, `17135550147`, `hola@tudominio.com`, `tudominio.com` y `Houston, Texas`.
2. **Logotipo**: reemplaza `assets/img/logo.svg` (oscuro) y `logo-light.svg` (claro), `favicon.svg`, los PNG de íconos y `og-image.jpg`.
3. **Colores**: los tonos están en variables CSS (`:root` de `styles.css`, `sitio.css` y `mono.css`).
4. **Servicios y etapas**: `SERVICIOS` en `assets/js/admin/core.js`.
5. **Datos de ejemplo**: función `sembrar()` en `assets/js/backend.js` (cambia `_version` para que se vuelvan a cargar).

## Pasar a producción

La demostración no se conecta a ningún servicio. Para usarlo con datos reales:

- El panel usa la API del cliente de Supabase (`from().select()`, `rpc`, `functions.invoke`, `storage`, `auth`), así que el código de los módulos no cambia. Se carga `@supabase/supabase-js` en lugar de `backend.js` y se reemplazan `CRM.api` y la llave `'demo'` por la URL y la llave pública del proyecto en `core.js`, `portal.js` y las páginas públicas; las subidas de archivos de los formularios públicos (`CRM.subir`) pasan a Supabase Storage.
- Hay que crear en la base de datos las tablas que usa el sistema (`clientes`, `casos`, `pagos`, `tareas`, `citas`, `conversaciones`, `mensajes_chat`, `solicitudes`, `mensajes_web`, `formularios`, `formulario_respuestas`, `documentos`, `contratos`, `planes`, `enlaces_pago`, `llamadas`, `contenido`, `campanas`, `cola_mensajes`, `sitio_items`, `ajustes`, `admins`, entre otras), las funciones `rpc` y las políticas de seguridad. `backend.js` documenta en código qué hace cada una (valores por defecto, reglas automáticas y funciones).
- Las integraciones reales (WhatsApp Business, Meta, Square/Stripe, Twilio, IA) se conectan con las claves de cada negocio desde **Ajustes**.

## Publicar

Cualquier hosting estático sirve (GitHub Pages, Netlify, Vercel, Cloudflare Pages). `404.html` usa rutas absolutas, pensadas para publicar en la raíz del dominio.
