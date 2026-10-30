# AGENTS.md

## Proyecto
**Facturita** — app de escritorio Tauri v2 (backend Rust + frontend React/TypeScript/Vite) que
se conecta al Google Calendar (solo lectura) y contabiliza las clases de inglés **por mes** y
**por cliente** (cliente = correo del invitado, excluyendo el correo de la profesora).

## Prerequisites
- Node 22+ / npm.
- Rust (rustup). En este Mac el binario está en `/opt/homebrew/opt/rustup/bin` (ya añadido a `~/.zshrc`).
- macOS: Xcode Command Line Tools. Windows: WebView2 (incluido en Win11).

## Comandos
- Dev (abre la app): `npm run tauri dev`
- Build del frontend (typecheck + Vite): `npm run build`
- Lint del frontend (Biome): `npm run lint`
- Formatear el frontend: `npm run format`
- Lint + formato + comprobaciones (Biome): `npm run check` (o `npm run check:fix` para aplicar)
- Tests del frontend (Vitest): `npm test` (`npm run test:watch` en modo vigilancia)
- Chequeo del backend: `cargo check` dentro de `src-tauri/`
- Formato del backend: `cargo fmt` (comprobar: `cargo fmt --check`)
- Lint del backend: `cargo clippy --all-targets -- -D warnings`
- Tests del backend: `cargo test` dentro de `src-tauri/`
- Build de release local (solo la plataforma actual): `npm run tauri build`
- Regenerar iconos desde el PNG fuente: `npm run tauri icon assets/icon-source.png`
- Generar claves de firma del updater: `npm run tauri signer generate -- -w ~/.tauri/facturita.key`

El frontend usa **Biome** (`biome.json`) para lint y formato; el backend, `rustfmt` + `clippy`.
Ambos se ejecutan en CI (job `checks`).


## Estructura
- `src/` — React. `src/App.tsx` orquesta el estado y compone las secciones.
  - `src/lib/` — `api.ts` (wrappers `invoke` + tipos), `dates.ts`, `view.ts` (helpers de rango
    de fechas y orden de secciones), `sorting.ts`, `useTheme.ts`, `useUpdater.ts`, `download.ts`.
  - `src/components/sections/` — `ImportSection`, `HistorySection`, `ClientsSection`,
    `SettingsSection` (reciben props desde `App.tsx`).
  - `src/components/` — `AccountMenu`, `Brand`, `SetupScreen`, `ConnectScreen`, `InlineValue`,
    `SortableTh`, `ConfirmDialog`, `DateRangePicker`, `MonthlyChart`, `RateHistoryEditor`,
    `Skeleton`, `Toasts`, `UpdateBanner`, `ErrorBoundary` e `icons.tsx`.
- `src-tauri/src/lib.rs` — estado de la app (`AppState`), registro de plugins y todos los comandos.
- `src-tauri/src/auth.rs` — OAuth 2.0 (PKCE, loopback), tokens (keyring del SO).
- `src-tauri/src/google.rs` — llamadas a Google Calendar API (calendarList, events, userinfo).
- `src-tauri/src/db.rs` — SQLite (rusqlite): esquema, upsert y queries de conteo.
- `src-tauri/src/models.rs` — structs compartidos (serde).

## Convenciones
- Comandos Tauri en snake_case en Rust; desde JS se invocan con objetos camelCase
  (Tauri convierte `calendarIds` ↔ `calendar_ids`).
- Los conteos se hacen en SQL (`substr(start_ts, 1, 7)` = mes). Solo se guardan eventos
  que califican como clase (con invitado cliente y no rechazado). Los eventos cancelados en
  Google también se importan (ver más abajo), pero no computan por defecto.
- Las fechas se guardan como RFC 3339 UTC (`YYYY-MM-DDTHH:MM:SSZ`).
- Tarifas/ingresos: el cobro automático es **siempre por clase** (no existe modo por hora);
  importe por alumno = la tarifa (compartida si la clase tiene >1 invitado; si no, la del cliente
  vigente en el mes de la clase —`client_rate_history`— o la **normal**). Tarifas en `settings`.
  Cada fila de `event_clients` puede tener una `override_rate` (tarifa/hora manual) que manda
  sobre cualquier tarifa y cuyo importe se multiplica por la duración de la clase (se edita en el
  detalle de clases del Histórico/Clientes y se conserva al reimportar).
- La UI tiene cinco secciones: **Importación** (importar un periodo + revisar y aceptar/descartar
  las clases importadas), **Histórico** (estadísticas por mes/cliente e ingresos), **Clientes**
  (maestro-detalle: lista de clientes a la izquierda y ficha a la derecha con nombre, tarifa,
  emails vinculados y clases; la tarifa/hora especial de cada clase se edita ahí),
  **Facturación** (datos fiscales del emisor + facturas emitidas) y **Ajustes** (tarifas globales
  y copia de seguridad). El periodo a importar se elige dentro de la tarjeta "Importar clases"; la
  lista de "Clases importadas" muestra solo las clases de ese periodo (`list_classes` con el rango
  de importación) y por defecto filtra las pendientes. Así el listado no crece sin límite.
- Las clases importadas quedan **pendientes** (`events.accepted = 0`) y NO aparecen en el
  Histórico hasta pulsar "Aceptar todo" (`accept_import` sobre todo el histórico). Las queries del
  Histórico filtran `accepted = 1 AND discarded = 0 AND stale = 0` y
  `(status != 'cancelled' OR include_cancelled = 1)`.
- **Cancelados**: `sync_events` pide a Google `showDeleted=true` e importa los eventos con
  `status = 'cancelled'` que tengan algún invitado cliente. Entran ya revisados (`accepted = 1`)
  pero con `events.include_cancelled = 0`, así que NO cuentan en Histórico/ingresos/facturas/CSV
  hasta pulsar "Incluir en el cómputo" (comando `set_event_cancelled_included`). "Aceptar todo" no
  los incluye; se deciden uno a uno en el filtro "Canceladas". Los cancelados sin invitados no se
  importan. La decisión se conserva al reimportar.
- **Zona horaria**: cada evento guarda `start_ts` (UTC, para ordenar y para la petición a Google)
  y `start_local` (`YYYY-MM-DDTHH:MM:SS` en el huso del calendario de Google, que ya viene en el
  `dateTime`). El día/mes por el que se cuenta y se factura es `start_local`
  (`COALESCE(substr(start_local,1,10), substr(start_ts,1,10))`), así una clase de madrugada no se
  imputa al mes anterior. La petición a Google usa una ventana UTC ampliada un día por cada lado
  (`fetch_range`) y luego se filtra por día local. Filas antiguas sin `start_local` caen al día UTC
  hasta que se reimportan.
- **Sincronización automática + reconciliación**: al abrir la app se importa el mes en curso
  (ajuste `settings.auto_sync`, por defecto activado; se desactiva en Ajustes). Tras importar,
  `sync_events` **reconcilia**: los eventos de los calendarios sincronizados que ya no aparecen en
  Google (borrados o que dejaron de cualificar) se marcan con `events.stale = 1`
  (`db::mark_stale`). Las filas `stale` no cuentan en Histórico/importes/facturación pero siguen
  visibles en Importación (filtro "Ya no cuentan"); al reaparecer en Google se limpian solas
  (`upsert_event` las vuelve a `stale = 0`). "Restaurar" usa el estado de revisión `restored`, que
  además limpia `stale`. La reconciliación solo se ejecuta si todas las descargas terminaron bien.
- Nombres de cliente editables en `client_names` (alias); si no hay, se usa el displayName de
  Google o el email. Tarifa por cliente en `client_rate_history` (histórico por mes; vacío =
  tarifa normal).
- **Varios emails por cliente**: `client_aliases (email, client_email)` agrupa varios emails de
  Google bajo un cliente canónico (p. ej. una empresa). Todas las queries de conteo/ingresos/
  facturas resuelven el email canónico, así que las clases de un email vinculado se suman
  automáticamente al cliente (también las ya importadas y las futuras). El vínculo se gestiona al
  desplegar el cliente en Clientes (comandos `link_client_alias`/`unlink_client_alias`);
  «Separar» devuelve el email a cliente independiente. Se incluye en la copia de seguridad.
- Convocatorias: `event_clients.billable` (1 por defecto) indica quién cuenta para la clase. En
  Importación se puede excluir a un invitado que no da clase (p. ej. un padre añadido a la clase
  individual de su hijo) pulsando su chip o eligiendo «Individual · nombre» en el tipo; con un
  único alumno la clase pasa a individual y con varios sigue siendo compartida. Solo cuentan las
  filas `billable = 1` en conteos, ingresos, facturas y CSV. La selección se conserva al
  reimportar (`upsert_event`), salvo que se quede sin ningún alumno que cuente.
- Facturas: datos del emisor en `settings` (`issuer_*`, incluida `issuer_bank_account` para la
  cuenta de ingreso). Datos fiscales del cliente en `client_billing (email, legal_name, tax_id,
  address)`, editables desde su ficha en Clientes y usados automáticamente en el preview y el PDF.
  Tabla `invoices` (numeración `serie-año` con `UNIQUE(series, number)`; serie = año). El comando
  `issue_invoice` asigna el nº, genera el PDF (`printpdf`, fuentes estándar Helvetica/WinAnsi) y
  guarda el registro con un snapshot JSON en `data`, del que se re-genera el PDF
  (`export_saved_invoice`). Sin IVA. El flujo de UI es un diálogo que se abre desde la ficha del
  cliente en Clientes (mes preseleccionado = mes anterior, pero se puede elegir el mes en curso para
  facturar antes de que acabe) + la pestaña Facturación.

- Las pestañas se pueden **reordenar arrastrando** (o Alt+←/→); el orden se guarda en
  `view_state.sectionOrder` (por defecto: Histórico, Clientes, Importación, Ajustes).
- Componentes UI: `ConfirmDialog`/`useConfirm` (modales), `MonthlyChart` (gráfico SVG del
  Histórico), `ClientEmailsEditor` (varios emails por cliente), `ClientBillingEditor` (datos
  fiscales del cliente), `Toasts`, `Skeleton`, `ErrorBoundary` e iconos en `components/icons.tsx`.

## Notas
- Google no permite OAuth en webviews embebidos ni deep-links: se usa `tauri-plugin-oauth`
  (servidor loopback `127.0.0.1`) + navegador del sistema.
- El `client_id`/`client_secret` se guardan en la tabla `settings` de SQLite; el
  `refresh_token` en el keyring del sistema (Keychain / Windows Credential Manager). Si no hay
  credenciales en `settings`, se usan las inyectadas en build con `FACTURITA_CLIENT_ID` /
  `FACTURITA_CLIENT_SECRET` (p. ej. `FACTURITA_CLIENT_ID=... FACTURITA_CLIENT_SECRET=... npm run
  tauri build`); el CI las toma de los secretos del repo. Para desarrollo local se puede usar un
  `.env` (gitignored).
- Copia de seguridad: comandos `export_backup`/`import_backup` (sección Ajustes) con
  `tauri-plugin-dialog`. Vuelcan/restauran `events`, `event_clients`, `client_rate_history`,
  `client_names`, `client_aliases`, `client_billing` y `settings` en JSON; el `client_secret` nunca
  se exporta ni se borra.
- Borrado total: comando `clear_all_data` (Ajustes → "Borrar datos"). Elimina clases,
  invitaciones, nombres, tarifas por cliente, vínculos de emails, datos fiscales de clientes y
  facturas; conserva credenciales, tarifas globales, datos fiscales del emisor y preferencias.
- Tarifas por cliente con histórico: `client_rate_history (email, effective_from 'YYYY-MM', rate)`.
  Al editar la tarifa se guarda con el mes en curso (o el mes indicado); cada clase usa la tarifa
  vigente en su mes (`rate` NULL = tarifa normal). La tabla legacy `client_rates` se migra y se
  elimina en `db::init`. El editor de historial está en `components/RateHistoryEditor.tsx`.
- Importación: filtro por estado y selección múltiple (comando `set_events_review`). El badge de la
  pestaña usa `pending_count` (clases pendientes de aceptar en todo el histórico).
- Tema claro/oscuro/sistema en el menú de cuenta; se guarda en `settings.theme` y se espeja en
  `localStorage` (`facturita-theme`) para evitar el flash al arrancar (script inline en `index.html`).
- Si el refresh token caduca/revoca, el backend devuelve `REAUTH_REQUIRED:...`; `src/lib/api.ts` lo
  detecta y emite `facturita:reauth`. `App.tsx` sustituye toda la app por `ConnectScreen` en modo
  reconexión; al volver a autorizar se recarga el estado y se monta de nuevo el panel, de modo que
  no queda ningún error obsoleto en pantalla.
- La build para Windows se hace en CI (`.github/workflows/build.yml`), no desde macOS.
- Auto-actualizaciones con `tauri-plugin-updater`: la app consulta
  `https://github.com/<usuario>/<repo>/releases/latest/download/latest.json` (ver `plugins.updater`
  en `tauri.conf.json`). La versión y el botón "Buscar actualizaciones" están en el menú de cuenta;
  el hook `src/lib/useUpdater.ts` y `components/UpdateBanner.tsx` gestionan el aviso/instalación.
  Publicar = subir `version` y `git tag vX.Y.Z` + push del tag; el CI crea la
  release. Requiere el secreto `TAURI_SIGNING_PRIVATE_KEY` (y `..._PASSWORD` si la clave tiene).
  La firma del updater NO es la firma de código del SO.
- `npm run tauri build` local necesita `TAURI_SIGNING_PRIVATE_KEY_PATH=~/.tauri/facturita.key`
  (o `TAURI_SIGNING_PRIVATE_KEY`) porque `createUpdaterArtifacts` está activo.
