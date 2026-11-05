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
    /// Skin global. `None` = skin padrão do jogo.
    pub global: Option<String>,
    /// Última skin enviada para a conta ("default" ou "<id>:<variant>"), para não reenviar à toa.
    pub last_applied: Option<String>,
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

/// Envia a skin desejada para a conta se for diferente da última enviada.
/// `wanted = None` volta para a skin padrão do jogo.
pub async fn apply(client: &reqwest::Client, root: &Path, token: &str, wanted: Option<&str>) -> Result<(), String> {
    let mut lib = load(root);
    let skin = wanted.and_then(|id| lib.skins.iter().find(|s| s.id == id).cloned());
    let key = match &skin {
        Some(s) => format!("{}:{:?}", s.id, s.variant),
        None => "default".into(),
    };
    if lib.last_applied.as_deref() == Some(key.as_str()) {
        return Ok(());
    }
    let api = "https://api.minecraftservices.com/minecraft/profile/skins";
    let resp = match &skin {
        Some(s) => {
            let part = reqwest::multipart::Part::bytes(png(root, &s.id)?).file_name("skin.png").mime_str("image/png").map_err(|e| e.to_string())?;
            let variant = if s.variant == Variant::Slim { "slim" } else { "classic" };
            let form = reqwest::multipart::Form::new().text("variant", variant).part("file", part);
            client.post(api).bearer_auth(token).multipart(form).send().await
        }
        None => client.delete(format!("{api}/active")).bearer_auth(token).send().await,
    }
    .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("a Mojang recusou a skin (HTTP {})", resp.status()));
    }
    lib.last_applied = Some(key);
    save(root, &lib)
}
