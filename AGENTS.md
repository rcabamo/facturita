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
- Chequeo del backend: `cargo check` dentro de `src-tauri/`
- Build de release local (solo la plataforma actual): `npm run tauri build`
- Regenerar iconos desde el PNG fuente: `npm run tauri icon assets/icon-source.png`
- Generar claves de firma del updater: `npm run tauri signer generate -- -w ~/.tauri/facturita.key`

No hay linter/formatter configurado todavía.

## Estructura
- `src/` — React. `src/lib/api.ts` (wrappers `invoke` + tipos), `src/lib/dates.ts`, `src/App.tsx`, `src/App.css`.
- `src-tauri/src/lib.rs` — estado de la app (`AppState`), registro de plugins y todos los comandos.
- `src-tauri/src/auth.rs` — OAuth 2.0 (PKCE, loopback), tokens (keyring del SO).
- `src-tauri/src/google.rs` — llamadas a Google Calendar API (calendarList, events, userinfo).
- `src-tauri/src/db.rs` — SQLite (rusqlite): esquema, upsert y queries de conteo.
- `src-tauri/src/models.rs` — structs compartidos (serde).

## Convenciones
- Comandos Tauri en snake_case en Rust; desde JS se invocan con objetos camelCase
  (Tauri convierte `calendarIds` ↔ `calendar_ids`).
- Los conteos se hacen en SQL (`substr(start_ts, 1, 7)` = mes). Solo se guardan eventos
  que califican como clase (con invitado cliente, no cancelado, no rechazado).
- Las fechas se guardan como RFC 3339 UTC (`YYYY-MM-DDTHH:MM:SSZ`).
- Tarifas/ingresos: importe por alumno = tarifa × (duración_min/60) en modo `hour`, o tarifa
  en modo `class`. Si la clase tiene >1 invitado usa la **tarifa compartida**; si no, la tarifa
  del cliente (override en `client_rates`) o la **normal**. Modo y tarifas en `settings`.
- La UI tiene tres secciones: **Importación** (sincronizar, tarifas, clases importadas y
  aceptar/descartar), **Histórico** (estadísticas por mes/cliente e ingresos) y **Clientes**
  (nombre y tarifa por cliente + todas sus clases de todos los tiempos).
- Las clases importadas quedan **pendientes** (`events.accepted = 0`) y NO aparecen en el
  Histórico hasta pulsar "Aceptar importación" (`accept_import`). Las queries del Histórico
  filtran `accepted = 1`.
- Nombres de cliente editables en `client_names` (alias); si no hay, se usa el displayName de
  Google o el email. Tarifa por cliente en `client_rates` (vacío = tarifa normal).

## Notas
- Google no permite OAuth en webviews embebidos ni deep-links: se usa `tauri-plugin-oauth`
  (servidor loopback `127.0.0.1`) + navegador del sistema.
- El `client_id`/`client_secret` se guardan en la tabla `settings` de SQLite; el
  `refresh_token` en el keyring del sistema (Keychain / Windows Credential Manager).
- La build para Windows se hace en CI (`.github/workflows/build.yml`), no desde macOS.
- Auto-actualizaciones con `tauri-plugin-updater`: la app consulta
  `https://github.com/<usuario>/<repo>/releases/latest/download/latest.json` (ver `plugins.updater`
  en `tauri.conf.json`). Publicar = subir `version` y `git tag vX.Y.Z` + push del tag; el CI crea la
  release. Requiere el secreto `TAURI_SIGNING_PRIVATE_KEY` (y `..._PASSWORD` si la clave tiene).
  La firma del updater NO es la firma de código del SO.
- `npm run tauri build` local necesita `TAURI_SIGNING_PRIVATE_KEY_PATH=~/.tauri/facturita.key`
  (o `TAURI_SIGNING_PRIVATE_KEY`) porque `createUpdaterArtifacts` está activo.
