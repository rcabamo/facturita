use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc::{channel, Receiver};

pub const SCOPES: &str = "openid email https://www.googleapis.com/auth/calendar.readonly";

/// Se devuelve como error cuando el refresh token ya no es válido (revocado o
/// caducado) y hace falta volver a autorizar. El frontend lo detecta por este prefijo.
pub const REAUTH_REQUIRED: &str = "REAUTH_REQUIRED: la sesión de Google caducó o fue revocada.";
const AUTH_URI: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URI: &str = "https://oauth2.googleapis.com/token";
const KEYRING_SERVICE: &str = "com.rcaba.facturita";
const KEYRING_USER: &str = "google_refresh_token";

fn random_b64(byte_len: usize) -> String {
    let mut bytes = vec![0u8; byte_len];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn code_verifier() -> String {
    random_b64(64)
}

pub fn code_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

pub fn random_state() -> String {
    random_b64(24)
}

pub fn build_auth_url(client_id: &str, redirect_uri: &str, challenge: &str, state: &str) -> String {
    let mut url = url::Url::parse(AUTH_URI).expect("auth uri");
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", SCOPES)
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent")
        .append_pair("include_granted_scopes", "true")
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", state);
    url.to_string()
}

/// Arranca un servidor local en 127.0.0.1 con un puerto libre y devuelve el puerto y un receptor
/// que recibirá la URL de callback (`http://127.0.0.1:{port}/?code=...&state=...`) cuando el
/// navegador sea redirigido por Google.
pub fn start_loopback_server() -> Result<(u16, Receiver<String>), String> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let (sender, receiver) = channel::<String>();

    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let mut stream = match stream {
                Ok(stream) => stream,
                Err(_) => continue,
            };

            let mut buffer = [0u8; 8192];
            let read = match stream.read(&mut buffer) {
                Ok(read) => read,
                Err(_) => continue,
            };
            let request = String::from_utf8_lossy(&buffer[..read]);

            // Primera línea: "GET /?code=...&state=... HTTP/1.1"
            let target = request
                .lines()
                .next()
                .and_then(|line| line.split_whitespace().nth(1))
                .unwrap_or("");

            let is_callback = target.contains("code=") || target.contains("error=");
            let body = if is_callback {
                "<!doctype html><html><head><meta charset=\"utf-8\"><title>Facturita</title></head>\
                 <body style=\"font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:48px;text-align:center\">\
                 <h2>¡Listo!</h2><p>Ya puedes cerrar esta pestaña y volver a Facturita.</p></body></html>"
            } else {
                "<!doctype html><html><body>OK</body></html>"
            };
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();

            if is_callback {
                let _ = sender.send(format!("http://127.0.0.1:{}{}", port, target));
                break;
            }
        }
    });

    Ok((port, receiver))
}

#[derive(Deserialize)]
struct TokenResponse {
    #[serde(default)]
    access_token: Option<String>,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<i64>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    error_description: Option<String>,
}

fn token_error(response: &TokenResponse) -> String {
    match (&response.error, &response.error_description) {
        (Some(code), Some(desc)) => format!("{}: {}", code, desc),
        (Some(code), None) => code.clone(),
        _ => "respuesta inválida del servidor de tokens".to_string(),
    }
}

pub async fn exchange_code(
    http: &reqwest::Client,
    client_id: &str,
    client_secret: &str,
    code: &str,
    redirect_uri: &str,
    verifier: &str,
) -> Result<(String, String, i64), String> {
    let params = [
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("grant_type", "authorization_code"),
        ("code_verifier", verifier),
    ];
    let response = http
        .post(TOKEN_URI)
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = response.status();
    let body = response.text().await.map_err(|e| e.to_string())?;
    let data: TokenResponse = serde_json::from_str(&body).map_err(|_| {
        format!(
            "respuesta no esperada del servidor de tokens ({}): {}",
            status, body
        )
    })?;
    let access = data
        .access_token
        .clone()
        .ok_or_else(|| token_error(&data))?;
    let refresh = data.refresh_token.clone().ok_or(
        "Google no devolvió un refresh token. Revoca el acceso de la app y vuelve a conectar.",
    )?;
    Ok((access, refresh, data.expires_in.unwrap_or(3600)))
}

pub async fn refresh_access_token(
    http: &reqwest::Client,
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<(String, i64), String> {
    let params = [
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ];
    let response = http
        .post(TOKEN_URI)
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let data: TokenResponse = response.json().await.map_err(|e| e.to_string())?;
    if data.error.as_deref() == Some("invalid_grant") {
        return Err(REAUTH_REQUIRED.to_string());
    }
    let access = data
        .access_token
        .clone()
        .ok_or_else(|| token_error(&data))?;
    Ok((access, data.expires_in.unwrap_or(3600)))
}

fn keyring_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

pub fn save_refresh_token(token: &str) -> Result<(), String> {
    keyring_entry()?
        .set_password(token)
        .map_err(|e| e.to_string())
}

pub fn load_refresh_token() -> Result<String, String> {
    match keyring_entry()?.get_password() {
        Ok(token) => Ok(token),
        Err(keyring::Error::NoEntry) => Err("No hay una cuenta conectada.".to_string()),
        Err(e) => Err(e.to_string()),
    }
}

pub fn delete_refresh_token() -> Result<(), String> {
    match keyring_entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
