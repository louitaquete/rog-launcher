//! Busca e instalação pelo CurseForge (api.curseforge.com/v1).
//! A chave entra na compilação pela variável CURSEFORGE_API_KEY (secret do GitHub Actions).

use std::collections::HashSet;
use std::path::Path;

use serde::Serialize;
use serde_json::Value;

use crate::content::{InstallReq, Kind, Meta};

const API: &str = "https://api.curseforge.com/v1";
const MINECRAFT: u32 = 432;
const KEY: Option<&str> = option_env!("CURSEFORGE_API_KEY");

pub fn available() -> bool {
    KEY.is_some_and(|k| !k.is_empty())
}

fn class_id(kind: Kind) -> u32 {
    match kind {
        Kind::Mod => 6,
        Kind::Resourcepack => 12,
        Kind::Shader => 6552,
    }
}

/// modLoaderType do CurseForge (Forge 1, Fabric 4, Quilt 5, NeoForge 6).
fn loader_id(loader: &str) -> Option<u32> {
    match loader {
        "Forge" => Some(1),
        "Fabric" => Some(4),
        "Quilt" => Some(5),
        "NeoForge" => Some(6),
        _ => None,
    }
}

/// Mesmo formato do resultado do Modrinth no front.
#[derive(Debug, Serialize)]
pub struct Hit {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub author: String,
    pub downloads: u64,
    pub follows: u64,
    pub icon_url: Option<String>,
    pub url: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Page {
    pub hits: Vec<Hit>,
    pub total_hits: u64,
}

async fn get(client: &reqwest::Client, path: &str, query: &[(&str, String)]) -> Result<Value, String> {
    let key = KEY.filter(|k| !k.is_empty()).ok_or("este build não tem chave do CurseForge")?;
    let r = client
        .get(format!("{API}{path}"))
        .header("x-api-key", key)
        .header("Accept", "application/json")
        .query(query)
        .send()
        .await
        .map_err(|e| format!("sem conexão com o CurseForge: {e}"))?;
    if !r.status().is_success() {
        return Err(format!("CurseForge: HTTP {}", r.status()));
    }
    r.json().await.map_err(|e| e.to_string())
}

fn hit(m: &Value) -> Hit {
    Hit {
        project_id: m["id"].as_u64().unwrap_or(0).to_string(),
        slug: m["slug"].as_str().unwrap_or_default().into(),
        title: m["name"].as_str().unwrap_or_default().into(),
        description: m["summary"].as_str().unwrap_or_default().into(),
        author: m["authors"][0]["name"].as_str().unwrap_or("?").into(),
        downloads: m["downloadCount"].as_f64().unwrap_or(0.0) as u64,
        follows: m["thumbsUpCount"].as_u64().unwrap_or(0),
        icon_url: m["logo"]["thumbnailUrl"].as_str().map(String::from),
        url: m["links"]["websiteUrl"].as_str().map(String::from),
    }
}

pub async fn search(client: &reqwest::Client, kind: Kind, mc: &str, loader: &str, query: &str, sort: &str, offset: u32) -> Result<Page, String> {
    // sortField: 2 popularidade, 3 atualizado, 6 downloads, 1 em destaque
    let sort_field = match sort {
        "downloads" => 6,
        "updated" => 3,
        "follows" => 2,
        _ => 2,
    };
    let mut q = vec![
        ("gameId", MINECRAFT.to_string()),
        ("classId", class_id(kind).to_string()),
        ("gameVersion", mc.to_string()),
        ("searchFilter", query.to_string()),
        ("sortField", sort_field.to_string()),
        ("sortOrder", "desc".into()),
        ("pageSize", "24".into()),
        ("index", offset.to_string()),
    ];
    if kind == Kind::Mod
        && let Some(l) = loader_id(loader) {
            q.push(("modLoaderType", l.to_string()));
        }
    let v = get(client, "/mods/search", &q).await?;
    let hits = v["data"].as_array().map(|a| a.iter().map(hit).collect()).unwrap_or_default();
    // A API só pagina até 10 mil resultados.
    let total = v["pagination"]["totalCount"].as_u64().unwrap_or(0).min(10_000);
    Ok(Page { hits, total_hits: total })
}

/// Instala o projeto e as dependências obrigatórias. Devolve os títulos instalados.
/// Erro `BLOCKED:<url>` quando o autor não libera download por outros apps.
pub async fn install(client: &reqwest::Client, game: &Path, kind: Kind, mc: &str, loader: &str, project_id: u64) -> Result<Vec<String>, String> {
    let mut done = HashSet::new();
    let mut out = Vec::new();
    let mut queue = vec![(kind, project_id)];
    while let Some((kind, id)) = queue.pop() {
        if !done.insert(id) {
            continue;
        }
        let m = get(client, &format!("/mods/{id}"), &[]).await?;
        let m = &m["data"];
        let title = m["name"].as_str().unwrap_or_default().to_string();

        let mut q = vec![("gameVersion", mc.to_string()), ("pageSize", "20".into())];
        if kind == Kind::Mod
            && let Some(l) = loader_id(loader) {
                q.push(("modLoaderType", l.to_string()));
            }
        let files = get(client, &format!("/mods/{id}/files"), &q).await?;
        let list = files["data"].as_array().cloned().unwrap_or_default();
        // releaseType: 1 release, 2 beta, 3 alpha
        let file = list.iter().find(|f| f["releaseType"].as_u64() == Some(1)).or(list.first()).ok_or(format!("{title} não tem versão para {mc}"))?;

        let Some(url) = file["downloadUrl"].as_str() else {
            let site = m["links"]["websiteUrl"].as_str().unwrap_or("https://www.curseforge.com/minecraft");
            return Err(format!("BLOCKED:{site}"));
        };
        let sha1 = file["hashes"].as_array().and_then(|h| h.iter().find(|x| x["algo"].as_u64() == Some(1))).and_then(|x| x["value"].as_str()).map(String::from);

        crate::content::install(
            client,
            game,
            InstallReq {
                url: url.to_string(),
                sha1,
                meta: Meta {
                    kind,
                    file: file["fileName"].as_str().unwrap_or_default().into(),
                    source: "curseforge".into(),
                    project_id: id.to_string(),
                    version_id: file["id"].as_u64().unwrap_or(0).to_string(),
                    version_number: file["displayName"].as_str().unwrap_or_default().into(),
                    title: title.clone(),
                    icon_url: m["logo"]["thumbnailUrl"].as_str().map(String::from),
                },
            },
        )
        .await?;
        out.push(title);

        // relationType 3 = dependência obrigatória
        for d in file["dependencies"].as_array().into_iter().flatten() {
            if d["relationType"].as_u64() == Some(3)
                && let Some(dep) = d["modId"].as_u64() {
                    queue.push((if kind == Kind::Shader { Kind::Mod } else { kind }, dep));
                }
        }
    }
    Ok(out)
}

/// Baixa arquivos de um modpack (`(projectID, fileID)`) para `mods_dir`.
/// Devolve os nomes dos que o autor não libera para outros apps.
pub async fn download_files(client: &reqwest::Client, mods_dir: &Path, ids: &[(u64, u64)]) -> Result<Vec<String>, String> {
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let key = KEY.filter(|k| !k.is_empty()).ok_or("esse modpack é do CurseForge e este build ainda não tem acesso à API do CurseForge")?;
    let file_ids: Vec<u64> = ids.iter().map(|(_, f)| *f).collect();
    let r = client
        .post(format!("{API}/mods/files"))
        .header("x-api-key", key)
        .json(&serde_json::json!({ "fileIds": file_ids }))
        .send()
        .await
        .map_err(|e| format!("sem conexão com o CurseForge: {e}"))?;
    if !r.status().is_success() {
        return Err(format!("CurseForge: HTTP {}", r.status()));
    }
    let v: Value = r.json().await.map_err(|e| e.to_string())?;
    let mut blocked = Vec::new();
    for f in v["data"].as_array().into_iter().flatten() {
        let name = f["fileName"].as_str().unwrap_or_default();
        if name.is_empty() || name.contains(['/', '\\']) {
            continue;
        }
        let Some(url) = f["downloadUrl"].as_str() else {
            blocked.push(f["displayName"].as_str().unwrap_or(name).to_string());
            continue;
        };
        let sha1 = f["hashes"].as_array().and_then(|h| h.iter().find(|x| x["algo"].as_u64() == Some(1))).and_then(|x| x["value"].as_str());
        let bytes = crate::install::download::fetch(client, url, sha1).await?;
        crate::install::download::write_atomic(&mods_dir.join(name), &bytes, false).await.map_err(|e| e.to_string())?;
    }
    Ok(blocked)
}

/// Busca modpacks (classId 4471) para a aba Modpacks.
pub async fn search_modpacks(client: &reqwest::Client, query: &str, offset: u32, game_version: Option<&str>, loader: Option<u32>, sort: u32) -> Result<Page, String> {
    let mut q = vec![
        ("gameId", MINECRAFT.to_string()),
        ("classId", "4471".into()),
        ("searchFilter", query.to_string()),
        ("sortField", sort.to_string()),
        ("sortOrder", "desc".into()),
        ("pageSize", "20".into()),
        ("index", offset.to_string()),
    ];
    if let Some(v) = game_version.filter(|v| !v.is_empty()) {
        q.push(("gameVersion", v.to_string()));
    }
    if let Some(l) = loader {
        q.push(("modLoaderType", l.to_string()));
    }
    let v = get(client, "/mods/search", &q).await?;
    let hits = v["data"].as_array().map(|a| a.iter().map(hit).collect()).unwrap_or_default();
    Ok(Page { hits, total_hits: v["pagination"]["totalCount"].as_u64().unwrap_or(0).min(10_000) })
}

/// Baixa o .zip mais recente (release) de um modpack para `dest`.
pub async fn download_modpack(client: &reqwest::Client, project_id: u64, dest: &Path) -> Result<(), String> {
    let files = get(client, &format!("/mods/{project_id}/files"), &[("pageSize", "20".into())]).await?;
    let list = files["data"].as_array().cloned().unwrap_or_default();
    let file = list.iter().find(|f| f["releaseType"].as_u64() == Some(1)).or(list.first()).ok_or("esse modpack não tem arquivo")?;
    let url = file["downloadUrl"].as_str().ok_or("o autor desse modpack não libera download por outros apps")?;
    let bytes = crate::install::download::fetch(client, url, None).await?;
    std::fs::write(dest, bytes).map_err(|e| e.to_string())
}
