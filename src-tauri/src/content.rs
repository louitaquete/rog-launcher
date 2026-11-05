//! Conteúdo da instância: mods, resource packs e shaders.
//! Os arquivos ficam nas pastas do jogo; `.rog-content.json` guarda de onde veio cada um.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Mod,
    Resourcepack,
    Shader,
}

impl Kind {
    pub const ALL: [Kind; 3] = [Kind::Mod, Kind::Resourcepack, Kind::Shader];

    fn folder(self) -> &'static str {
        match self {
            Kind::Mod => "mods",
            Kind::Resourcepack => "resourcepacks",
            Kind::Shader => "shaderpacks",
        }
    }
}

/// Metadados de um arquivo baixado pelo launcher.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Meta {
    pub kind: Kind,
    /// Nome do arquivo sem `.disabled`.
    pub file: String,
    pub source: String,
    pub project_id: String,
    pub version_id: String,
    pub version_number: String,
    pub title: String,
    pub icon_url: Option<String>,
}

/// Item mostrado na lista de instalados.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub kind: Kind,
    pub file: String,
    pub enabled: bool,
    pub size: u64,
    pub meta: Option<Meta>,
}

/// Pedido de instalação vindo do front (já com a versão escolhida).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallReq {
    pub url: String,
    pub sha1: Option<String>,
    pub meta: Meta,
}

fn manifest_path(game: &Path) -> PathBuf {
    game.join(".rog-content.json")
}

fn load(game: &Path) -> Vec<Meta> {
    std::fs::read(manifest_path(game)).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn save(game: &Path, list: &[Meta]) -> Result<(), String> {
    crate::store::write_json(&manifest_path(game), &list).map_err(|e| e.to_string())
}

/// Evita `..` e separadores vindos de fora.
fn safe_name(name: &str) -> Result<&str, String> {
    if name.is_empty() || name.contains(['/', '\\']) || name.starts_with('.') {
        return Err(format!("nome de arquivo inválido: {name}"));
    }
    Ok(name)
}

pub fn list(game: &Path) -> Vec<Item> {
    let metas = load(game);
    let mut out = Vec::new();
    for kind in Kind::ALL {
        let Ok(dir) = std::fs::read_dir(game.join(kind.folder())) else { continue };
        for e in dir.flatten() {
            let Ok(md) = e.metadata() else { continue };
            if !md.is_file() {
                continue;
            }
            let raw = e.file_name().to_string_lossy().to_string();
            let (file, enabled) = match raw.strip_suffix(".disabled") {
                Some(f) => (f.to_string(), false),
                None => (raw, true),
            };
            let ok_ext = match kind {
                Kind::Mod => file.ends_with(".jar"),
                _ => file.ends_with(".zip"),
            };
            if !ok_ext {
                continue;
            }
            let meta = metas.iter().find(|m| m.kind == kind && m.file == file).cloned();
            out.push(Item { kind, file, enabled, size: md.len(), meta });
        }
    }
    out.sort_by_key(|i| i.meta.as_ref().map(|m| m.title.to_lowercase()).unwrap_or_else(|| i.file.to_lowercase()));
    out
}

pub async fn install(client: &reqwest::Client, game: &Path, req: InstallReq) -> Result<(), String> {
    let file = safe_name(&req.meta.file)?.to_string();
    let dir = game.join(req.meta.kind.folder());
    let bytes = crate::install::download::fetch(client, &req.url, req.sha1.as_deref()).await?;
    crate::install::download::write_atomic(&dir.join(&file), &bytes, false).await.map_err(|e| e.to_string())?;

    // Troca a versão antiga do mesmo projeto.
    let mut metas = load(game);
    metas.retain(|m| {
        let same = m.kind == req.meta.kind && (m.project_id == req.meta.project_id || m.file == file);
        if same && m.file != file {
            let _ = std::fs::remove_file(dir.join(&m.file));
            let _ = std::fs::remove_file(dir.join(format!("{}.disabled", m.file)));
        }
        !same
    });
    metas.push(req.meta);
    save(game, &metas)
}

pub fn remove(game: &Path, kind: Kind, file: &str) -> Result<(), String> {
    let file = safe_name(file)?;
    let dir = game.join(kind.folder());
    let _ = std::fs::remove_file(dir.join(file));
    let _ = std::fs::remove_file(dir.join(format!("{file}.disabled")));
    let mut metas = load(game);
    metas.retain(|m| !(m.kind == kind && m.file == file));
    save(game, &metas)
}

pub fn toggle(game: &Path, kind: Kind, file: &str, enabled: bool) -> Result<(), String> {
    let file = safe_name(file)?;
    let dir = game.join(kind.folder());
    let (on, off) = (dir.join(file), dir.join(format!("{file}.disabled")));
    let (from, to) = if enabled { (off, on) } else { (on, off) };
    if from.exists() {
        std::fs::rename(from, to).map_err(|e| e.to_string())?;
    }
    Ok(())
}
