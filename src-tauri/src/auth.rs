//! Login Microsoft → Xbox Live → XSTS → Minecraft, com verificação de posse do jogo.
//! Fluxo de código de dispositivo: o usuário digita um código em microsoft.com/link.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// App registrado no Azure e aprovado pela Mojang.
const CLIENT_ID: &str = "89552a05-caf9-4939-8495-48a75a53a778";
const SCOPE: &str = "XboxLive.signin offline_access";
const MS: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0";

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Conta salva em `accounts.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Saved {
    pub name: String,
    pub uuid: String,
    pub xuid: String,
    pub mc_token: String,
    pub mc_expires_at: u64,
    pub refresh_token: String,
}

/// O que o front vê (sem tokens).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Public {
    pub name: String,
    pub uuid: String,
}

impl From<&Saved> for Public {
    fn from(s: &Saved) -> Self {
        Self { name: s.name.clone(), uuid: s.uuid.clone() }
    }
}

fn file(root: &Path) -> PathBuf {
    root.join("accounts.json")
}

pub fn load(root: &Path) -> Option<Saved> {
    serde_json::from_slice(&std::fs::read(file(root)).ok()?).ok()
}

fn save(root: &Path, s: &Saved) -> Result<(), String> {
    crate::store::write_json(&file(root), s).map_err(|e| e.to_string())
}

pub fn logout(root: &Path) {
    let _ = std::fs::remove_file(file(root));
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub interval: u64,
    pub expires_in: u64,
}

async fn json_of(r: reqwest::Response, step: &str) -> Result<Value, String> {
    let status = r.status();
    let body: Value = r.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        return Err(format!("{step} falhou ({status}): {body}"));
    }
    Ok(body)
}

pub async fn start(client: &reqwest::Client) -> Result<DeviceCode, String> {
    let r = client
        .post(format!("{MS}/devicecode"))
        .form(&[("client_id", CLIENT_ID), ("scope", SCOPE)])
        .send()
        .await
        .map_err(|e| format!("sem conexão com a Microsoft: {e}"))?;
    let v = json_of(r, "Microsoft").await?;
    Ok(DeviceCode {
        device_code: v["device_code"].as_str().unwrap_or_default().into(),
        user_code: v["user_code"].as_str().unwrap_or_default().into(),
        verification_uri: v["verification_uri"].as_str().unwrap_or("https://www.microsoft.com/link").into(),
        interval: v["interval"].as_u64().unwrap_or(5),
        expires_in: v["expires_in"].as_u64().unwrap_or(900),
    })
}

/// Espera o usuário confirmar no navegador e completa a cadeia até o Minecraft.
pub async fn finish(client: &reqwest::Client, root: &Path, code: &DeviceCode, cancelled: impl Fn() -> bool) -> Result<Saved, String> {
    let deadline = now() + code.expires_in;
    let mut interval = code.interval.max(1);
    let (ms_token, refresh) = loop {
        if cancelled() {
            return Err("CANCELLED".into());
        }
        if now() > deadline {
            return Err("o código expirou, tente de novo".into());
        }
        tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
        let r = client
            .post(format!("{MS}/token"))
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ("client_id", CLIENT_ID),
                ("device_code", code.device_code.as_str()),
            ])
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let v: Value = r.json().await.unwrap_or(Value::Null);
        match v["error"].as_str() {
            None => break (str_of(&v, "access_token")?, str_of(&v, "refresh_token")?),
            Some("authorization_pending") => continue,
            Some("slow_down") => interval += 5,
            Some("authorization_declined") => return Err("login recusado".into()),
            Some("expired_token") => return Err("o código expirou, tente de novo".into()),
            Some(e) => return Err(format!("Microsoft: {e}")),
        }
    };
    let s = minecraft(client, &ms_token, refresh).await?;
    save(root, &s)?;
    Ok(s)
}

fn str_of(v: &Value, k: &str) -> Result<String, String> {
    v[k].as_str().map(String::from).ok_or_else(|| format!("resposta sem {k}"))
}

/// Conta pronta para jogar: renova o token se estiver perto de vencer.
pub async fn ensure(client: &reqwest::Client, root: &Path) -> Result<Saved, String> {
    let s = load(root).ok_or("NEEDS_ACCOUNT: conecte sua conta Microsoft para jogar")?;
    if s.mc_expires_at > now() + 300 {
        return Ok(s);
    }
    let r = client
        .post(format!("{MS}/token"))
        .form(&[("grant_type", "refresh_token"), ("client_id", CLIENT_ID), ("refresh_token", s.refresh_token.as_str()), ("scope", SCOPE)])
        .send()
        .await
        .map_err(|e| format!("sem conexão com a Microsoft: {e}"))?;
    let v: Value = r.json().await.unwrap_or(Value::Null);
    if v["error"].is_string() {
        logout(root);
        return Err("NEEDS_ACCOUNT: sua sessão expirou, entre de novo".into());
    }
    let ms_token = str_of(&v, "access_token")?;
    let refresh = v["refresh_token"].as_str().map(String::from).unwrap_or(s.refresh_token);
    let fresh = minecraft(client, &ms_token, refresh).await?;
    save(root, &fresh)?;
    Ok(fresh)
}

/// Xbox Live → XSTS → Minecraft → posse do jogo → perfil.
async fn minecraft(client: &reqwest::Client, ms_token: &str, refresh_token: String) -> Result<Saved, String> {
    let xbl = json_of(
        client
            .post("https://user.auth.xboxlive.com/user/authenticate")
            .json(&json!({
                "Properties": { "AuthMethod": "RPS", "SiteName": "user.auth.xboxlive.com", "RpsTicket": format!("d={ms_token}") },
                "RelyingParty": "http://auth.xboxlive.com",
                "TokenType": "JWT"
            }))
            .send()
            .await
            .map_err(|e| e.to_string())?,
        "Xbox Live",
    )
    .await?;
    let xbl_token = str_of(&xbl, "Token")?;

    let r = client
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .json(&json!({
            "Properties": { "SandboxId": "RETAIL", "UserTokens": [xbl_token] },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if r.status().as_u16() == 401 {
        let v: Value = r.json().await.unwrap_or(Value::Null);
        return Err(match v["XErr"].as_u64() {
            Some(2148916233) => "essa conta Microsoft não tem perfil Xbox. Entre uma vez em xbox.com para criar".into(),
            Some(2148916235) => "o Xbox Live não está disponível no país da conta".into(),
            Some(2148916236 | 2148916237) => "a conta precisa de verificação de idade em xbox.com".into(),
            Some(2148916238) => "conta de menor: um adulto precisa adicioná-la a uma Família Microsoft".into(),
            _ => format!("Xbox recusou o login: {v}"),
        });
    }
    let xsts = json_of(r, "XSTS").await?;
    let xsts_token = str_of(&xsts, "Token")?;
    let uhs = xsts["DisplayClaims"]["xui"][0]["uhs"].as_str().ok_or("XSTS sem uhs")?.to_string();
    let xuid = xsts["DisplayClaims"]["xui"][0]["xid"].as_str().unwrap_or("0").to_string();

    let mc = json_of(
        client
            .post("https://api.minecraftservices.com/authentication/login_with_xbox")
            .json(&json!({ "identityToken": format!("XBL3.0 x={uhs};{xsts_token}") }))
            .send()
            .await
            .map_err(|e| e.to_string())?,
        "Minecraft",
    )
    .await?;
    let mc_token = str_of(&mc, "access_token")?;
    let expires = mc["expires_in"].as_u64().unwrap_or(86400);

    // Posse: entitlements + perfil (o perfil só existe para quem tem o jogo).
    let ent = json_of(
        client.get("https://api.minecraftservices.com/entitlements/mcstore").bearer_auth(&mc_token).send().await.map_err(|e| e.to_string())?,
        "verificação de posse",
    )
    .await?;
    let owns = ent["items"].as_array().is_some_and(|a| !a.is_empty());
    let r = client.get("https://api.minecraftservices.com/minecraft/profile").bearer_auth(&mc_token).send().await.map_err(|e| e.to_string())?;
    if r.status().as_u16() == 404 || !owns {
        return Err("NO_GAME: essa conta não tem o Minecraft: Java Edition".into());
    }
    let profile = json_of(r, "perfil").await?;

    Ok(Saved {
        name: str_of(&profile, "name")?,
        uuid: str_of(&profile, "id")?,
        xuid,
        mc_token,
        mc_expires_at: now() + expires,
        refresh_token,
    })
}
