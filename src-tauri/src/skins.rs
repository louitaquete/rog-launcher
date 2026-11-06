//! Biblioteca de skins (pasta `skins/`) e troca da skin na conta Mojang ao jogar.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Variant {
    Classic,
    Slim,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skin {
    pub id: String,
    pub name: String,
    pub variant: Variant,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Library {
    pub skins: Vec<Skin>,
    /// Skin global. `None` = a skin da própria conta (minecraft.net).
    pub global: Option<String>,
    /// Última skin enviada pelo launcher ("account" = a da própria conta, ou "<id>:<variant>").
    pub last_applied: Option<String>,
    /// Modelo da cópia da skin da conta (`account.png`).
    pub account_variant: Option<Variant>,
}

fn dir(root: &Path) -> PathBuf {
    root.join("skins")
}

pub fn load(root: &Path) -> Library {
    std::fs::read(dir(root).join("skins.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

pub fn save(root: &Path, lib: &Library) -> Result<(), String> {
    crate::store::write_json(&dir(root).join("skins.json"), lib).map_err(|e| e.to_string())
}

fn png_path(root: &Path, id: &str) -> Result<PathBuf, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("id de skin inválido".into());
    }
    Ok(dir(root).join(format!("{id}.png")))
}

/// Largura e altura de um PNG (cabeçalho IHDR).
fn png_size(b: &[u8]) -> Option<(u32, u32)> {
    if b.len() < 24 || &b[..8] != b"\x89PNG\r\n\x1a\n" || &b[12..16] != b"IHDR" {
        return None;
    }
    Some((u32::from_be_bytes(b[16..20].try_into().ok()?), u32::from_be_bytes(b[20..24].try_into().ok()?)))
}

pub fn add(root: &Path, file: &Path, name: &str, variant: Variant) -> Result<Skin, String> {
    let bytes = std::fs::read(file).map_err(|e| e.to_string())?;
    match png_size(&bytes) {
        Some((64, 64)) | Some((64, 32)) => {}
        Some((w, h)) => return Err(format!("a skin precisa ter 64×64 (essa tem {w}×{h})")),
        None => return Err("o arquivo precisa ser um .png".into()),
    }
    let id = format!("{:x}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
    std::fs::create_dir_all(dir(root)).map_err(|e| e.to_string())?;
    std::fs::write(png_path(root, &id)?, &bytes).map_err(|e| e.to_string())?;
    let name = name.trim();
    let skin = Skin { id, name: if name.is_empty() { "Skin".into() } else { name.chars().take(32).collect() }, variant };
    let mut lib = load(root);
    lib.skins.push(skin.clone());
    save(root, &lib)?;
    Ok(skin)
}

pub fn png(root: &Path, id: &str) -> Result<Vec<u8>, String> {
    std::fs::read(png_path(root, id)?).map_err(|e| e.to_string())
}

pub fn remove(root: &Path, id: &str) -> Result<(), String> {
    let _ = std::fs::remove_file(png_path(root, id)?);
    let mut lib = load(root);
    lib.skins.retain(|s| s.id != id);
    if lib.global.as_deref() == Some(id) {
        lib.global = None;
    }
    save(root, &lib)
}

pub fn update(root: &Path, skin: Skin) -> Result<(), String> {
    let mut lib = load(root);
    let s = lib.skins.iter_mut().find(|s| s.id == skin.id).ok_or("skin não encontrada")?;
    s.name = skin.name.chars().take(32).collect();
    s.variant = skin.variant;
    save(root, &lib)
}

/// Skin atual da conta (a do minecraft.net): PNG e modelo.
#[derive(Debug, Clone, Serialize)]
pub struct AccountSkin {
    pub png: Vec<u8>,
    pub variant: Variant,
}

/// Baixa a skin ativa do perfil e guarda como `account.png` (cópia para poder voltar a ela).
async fn fetch_account(client: &reqwest::Client, root: &Path, token: &str) -> Result<AccountSkin, String> {
    let r = client.get("https://api.minecraftservices.com/minecraft/profile").bearer_auth(token).send().await.map_err(|e| e.to_string())?;
    if !r.status().is_success() {
        return Err(format!("perfil: HTTP {}", r.status()));
    }
    let v: serde_json::Value = r.json().await.map_err(|e| e.to_string())?;
    let skin = v["skins"].as_array().and_then(|a| a.iter().find(|s| s["state"] == "ACTIVE").or(a.first())).ok_or("a conta não tem skin")?;
    let url = skin["url"].as_str().ok_or("skin sem url")?.replacen("http://", "https://", 1);
    let variant = if skin["variant"].as_str() == Some("SLIM") { Variant::Slim } else { Variant::Classic };
    let png = client.get(&url).send().await.map_err(|e| e.to_string())?.bytes().await.map_err(|e| e.to_string())?.to_vec();
    if png_size(&png).is_none() {
        return Err("a skin da conta não veio como PNG".into());
    }
    std::fs::create_dir_all(dir(root)).map_err(|e| e.to_string())?;
    std::fs::write(dir(root).join("account.png"), &png).map_err(|e| e.to_string())?;
    let mut lib = load(root);
    lib.account_variant = Some(variant);
    save(root, &lib)?;
    Ok(AccountSkin { png, variant })
}

fn account_backup(root: &Path) -> Option<AccountSkin> {
    let png = std::fs::read(dir(root).join("account.png")).ok()?;
    Some(AccountSkin { png, variant: load(root).account_variant.unwrap_or(Variant::Classic) })
}

/// A conta está com a própria skin (nada do launcher aplicado)?
fn using_own(lib: &Library) -> bool {
    matches!(lib.last_applied.as_deref(), None | Some("account"))
}

/// Skin da conta para a prévia: a atual (se o launcher não trocou) ou a cópia guardada.
pub async fn account_skin(client: &reqwest::Client, root: &Path, token: Option<&str>) -> Option<AccountSkin> {
    let lib = load(root);
    if using_own(&lib)
        && let Some(t) = token
            && let Ok(s) = fetch_account(client, root, t).await {
                return Some(s);
            }
    account_backup(root)
}

async fn upload(client: &reqwest::Client, token: &str, png: Vec<u8>, variant: Variant) -> Result<(), String> {
    let part = reqwest::multipart::Part::bytes(png).file_name("skin.png").mime_str("image/png").map_err(|e| e.to_string())?;
    let v = if variant == Variant::Slim { "slim" } else { "classic" };
    let form = reqwest::multipart::Form::new().text("variant", v).part("file", part);
    let r = client.post("https://api.minecraftservices.com/minecraft/profile/skins").bearer_auth(token).multipart(form).send().await.map_err(|e| e.to_string())?;
    if !r.status().is_success() {
        return Err(format!("a Mojang recusou a skin (HTTP {})", r.status()));
    }
    Ok(())
}

/// Deixa a conta com a skin desejada antes de jogar.
/// `wanted = None` = a skin da própria conta (minecraft.net): nunca apaga nada.
pub async fn apply(client: &reqwest::Client, root: &Path, token: &str, wanted: Option<&str>) -> Result<(), String> {
    let lib = load(root);
    match wanted.and_then(|id| lib.skins.iter().find(|s| s.id == id).cloned()) {
        Some(s) => {
            let key = format!("{}:{:?}", s.id, s.variant);
            if lib.last_applied.as_deref() == Some(key.as_str()) {
                return Ok(());
            }
            // Antes da primeira troca, guarda a skin da conta para poder voltar.
            if using_own(&lib) {
                fetch_account(client, root, token).await.map_err(|e| format!("não deu para guardar a skin da conta antes de trocar ({e})"))?;
            }
            upload(client, token, png(root, &s.id)?, s.variant).await?;
            let mut lib = load(root);
            lib.last_applied = Some(key);
            save(root, &lib)
        }
        None => {
            if using_own(&lib) {
                return Ok(());
            }
            let Some(b) = account_backup(root) else { return Ok(()) };
            upload(client, token, b.png, b.variant).await?;
            let mut lib = load(root);
            lib.last_applied = Some("account".into());
            save(root, &lib)
        }
    }
}
