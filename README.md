# Facturita

App de escritorio (Tauri v2) que se conecta a Google Calendar (solo lectura) y contabiliza
las clases de inglés **por mes** y **por cliente**. El cliente se identifica por el correo
del invitado del evento (excluyendo el de la profesora).

## Requisitos

- Node 22+ y npm
- Rust (rustup) — en este Mac: `export PATH="/opt/homebrew/opt/rustup/bin:$PATH"`
- macOS: Xcode Command Line Tools. Windows: WebView2.

## Configurar Google (una vez)

1. En [Google Cloud Console](https://console.cloud.google.com/) crea un proyecto y habilita
   **Google Calendar API**.
2. Configura la pantalla de consentimiento OAuth (tipo *External*) y agrega el correo de la
   profesora como *usuario de prueba*.
   - El modo *Testing* caduca el refresh token a los 7 días. Para evitarlo, publica la app en
     *Production* (sin verificar); aparecerá un aviso "app no verificada" que se salta con
     *Avanzado → Ir a la app*.
3. Crea credenciales OAuth de tipo **Aplicación de escritorio** y copia el `client_id` y
   `client_secret`.

La app pide estas credenciales en la primera pantalla y las guarda localmente.

## Desarrollo

```sh
npm install
npm run tauri dev
```

## Build

```sh
npm run tauri build   # solo la plataforma actual (macOS)
```

La build para Windows se genera en CI (GitHub Actions, runner `windows-latest`).

## Actualizaciones (updater)

La app usa `tauri-plugin-updater`: al abrir consulta las releases de GitHub y, si hay una versión
nueva, muestra un aviso para actualizar. Los datos (SQLite y el token del keyring) no se tocan.

**Setup (una vez):**

1. Sube el proyecto a un repo **público** de GitHub.
2. Genera las claves de firma: `npm run tauri signer generate -- -w ~/.tauri/facturita.key`.
3. En el repo → *Settings → Secrets and variables → Actions*, añade
   `TAURI_SIGNING_PRIVATE_KEY` con el **contenido** de `~/.tauri/facturita.key`
   (y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` solo si le pusiste contraseña).
4. Pon tu repo en `plugins.updater.endpoints` de `src-tauri/tauri.conf.json`
   (`https://github.com/<usuario>/<repo>/releases/latest/download/latest.json`). La `pubkey`
   ya está configurada.

**Publicar una versión:**

1. Sube el número en `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` y `package.json`.
2. Commit y push del tag:
   ```sh
   git tag v0.1.1 && git push origin v0.1.1
   ```
3. El CI compila, firma y publica la release (instaladores + `latest.json`). Las apps la detectan
   al abrirse.

En Windows el updater usa el instalador **NSIS** (el MSI no se auto-actualiza).

## Cómo cuenta las clases

- Sincroniza los eventos del rango elegido (`singleEvents=true`, expande recurrentes).
- Una clase = evento no cancelado con al menos un invitado que no sea la profesora ni una
  sala de recursos, y cuyo RSVP no sea *declined*.
- Los conteos se calculan en SQL agrupando por `YYYY-MM` y por correo del invitado.
