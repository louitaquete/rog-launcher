//! Instalação dos loaders de mods.
//!
//! - **Fabric** e **Quilt**: as APIs entregam um perfil JSON pronto, que herda do vanilla.
//! - **Forge** e **NeoForge**: rodamos o instalador oficial em modo cliente, apontando para a raiz `.Rog`
//!   (ela tem a mesma estrutura de `versions/` e `libraries/` que o instalador espera).
//!
//! OptiFine não entra aqui: não tem API e a licença proíbe baixar e redistribuir os arquivos.

use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::download::{fetch, write_atomic};
use super::mojang::LoaderProfile;
use crate::store::instances::LoaderType;

const FABRIC_META: &str = "https://meta.fabricmc.net/v2";
const QUILT_META: &str = "https://meta.quiltmc.org/v3";
const FORGE_PROMOS: &str = "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";
const FORGE_MAVEN: &str = "https://maven.minecraftforge.net/net/minecraftforge/forge";
const NEOFORGE_MAVEN: &str = "https://maven.neoforged.net/releases/net/neoforged/neoforge";

/// Resultado: id da versão a abrir (pasta em `versions/`) e versão do loader escolhida.
#[derive(Debug, Clone)]
pub struct Installed {
    pub version_id: String,
    pub loader_version: String,
}

#[derive(Deserialize)]
struct MetaLoader {
    loader: MetaLoaderVersion,
}

#[derive(Deserialize)]
struct MetaLoaderVersion {
    version: String,
    #[serde(default)]
    stable: Option<bool>,
}

fn is_prerelease(v: &str) -> bool {
    let v = v.to_ascii_lowercase();
    ["beta", "alpha", "pre", "rc"].iter().any(|t| v.contains(t))
}

async fn get_json<T: for<'de> Deserialize<'de>>(client: &reqwest::Client, url: &str) -> Result<T, String> {
    let bytes = fetch(client, url, None).await?;
    serde_json::from_slice(&bytes).map_err(|e| format!("{url}: resposta inválida ({e})"))
}

/// Escolhe a versão pedida ou a mais recente estável.
fn pick_meta(list: &[MetaLoader], wanted: Option<&str>) -> Option<String> {
    if let Some(w) = wanted {
        return list.iter().find(|l| l.loader.version == w).map(|l| l.loader.version.clone());
    }
    list.iter()
        .find(|l| l.loader.stable.unwrap_or_else(|| !is_prerelease(&l.loader.version)))
        .or(list.first())
        .map(|l| l.loader.version.clone())
}

/// Fabric e Quilt: baixa o perfil e grava em `versions/<id>/<id>.json`.
async fn meta_profile(client: &reqwest::Client, root: &Path, base: &str, mc: &str, wanted: Option<&str>, name: &str) -> Result<Installed, String> {
    let list: Vec<MetaLoader> = get_json(client, &format!("{base}/versions/loader/{mc}")).await?;
    let version = pick_meta(&list, wanted).ok_or_else(|| format!("{name} não tem versão para o Minecraft {mc}"))?;
    let bytes = fetch(client, &format!("{base}/versions/loader/{mc}/{version}/profile/json"), None).await?;
    let profile: LoaderProfile = serde_json::from_slice(&bytes).map_err(|e| format!("perfil do {name} inválido: {e}"))?;
    let dir = root.join("versions").join(&profile.id);
    write_atomic(&dir.join(format!("{}.json", profile.id)), &bytes, false).await.map_err(|e| e.to_string())?;
    Ok(Installed { version_id: profile.id, loader_version: version })
}

/// Versão do NeoForge para um Minecraft: 1.21.4 -> 21.4.x, 1.21 -> 21.0.x, 1.20.6 -> 20.6.x.
pub fn neoforge_prefix(mc: &str) -> Option<String> {
    let mut parts = mc.split('.');
    let major = parts.next()?;
    if major != "1" {
        // Numeração nova do Minecraft (ex.: 26.3): o NeoForge usa a mesma versão como prefixo.
        return Some(format!("{mc}."));
    }
    let minor = parts.next()?;
    let patch = parts.next().unwrap_or("0");
    Some(format!("{minor}.{patch}."))
}

/// Pega a última versão estável de um `maven-metadata.xml` que começa com `prefix`.
pub fn latest_from_metadata(xml: &str, prefix: &str) -> Option<String> {
    xml.split("<version>")
        .skip(1)
        .filter_map(|s| s.split("</version>").next())
        .filter(|v| v.starts_with(prefix) && !is_prerelease(v))
        .last()
        .map(str::to_string)
}

/// Uma versão de loader para o seletor.
#[derive(Debug, Clone, serde::Serialize)]
pub struct LoaderVersion {
    pub version: String,
    pub stable: bool,
    pub recommended: bool,
}

/// Versões disponíveis de um loader para o Minecraft `mc`, da mais nova para a mais antiga.
pub async fn versions(client: &reqwest::Client, kind: LoaderType, mc: &str) -> Result<Vec<LoaderVersion>, String> {
    let mut out: Vec<LoaderVersion> = match kind {
        LoaderType::Vanilla | LoaderType::OptiFine => vec![],
        LoaderType::Fabric | LoaderType::Quilt => {
            let base = if kind == LoaderType::Fabric { FABRIC_META } else { QUILT_META };
            let list: Vec<MetaLoader> = get_json(client, &format!("{base}/versions/loader/{mc}")).await?;
            list.into_iter()
                .map(|l| {
                    let stable = l.loader.stable.unwrap_or_else(|| !is_prerelease(&l.loader.version));
                    LoaderVersion { version: l.loader.version, stable, recommended: false }
                })
                .collect()
        }
        LoaderType::Forge => {
            let xml = String::from_utf8(fetch(client, &format!("{FORGE_MAVEN}/maven-metadata.xml"), None).await?).map_err(|e| e.to_string())?;
            let p: Option<Promos> = get_json(client, FORGE_PROMOS).await.ok();
            let rec = p.as_ref().and_then(|p| p.promos.get(&format!("{mc}-recommended")).cloned());
            let prefix = format!("{mc}-");
            let mut v: Vec<LoaderVersion> = xml
                .split("<version>")
                .skip(1)
                .filter_map(|s| s.split("</version>").next())
                .filter_map(|v| v.strip_prefix(&prefix))
                .map(|v| v.trim_end_matches(&format!("-{mc}")).to_string())
                .map(|v| LoaderVersion { stable: !is_prerelease(&v), recommended: rec.as_deref() == Some(v.as_str()), version: v })
                .collect();
            v.reverse();
            v
        }
        LoaderType::NeoForge => {
            let prefix = neoforge_prefix(mc).ok_or_else(|| format!("NeoForge não suporta o Minecraft {mc}"))?;
            let xml = String::from_utf8(fetch(client, &format!("{NEOFORGE_MAVEN}/maven-metadata.xml"), None).await?).map_err(|e| e.to_string())?;
            let mut v: Vec<LoaderVersion> = xml
                .split("<version>")
                .skip(1)
                .filter_map(|s| s.split("</version>").next())
                .filter(|v| v.starts_with(&prefix))
                .map(|v| LoaderVersion { version: v.to_string(), stable: !is_prerelease(v), recommended: false })
                .collect();
            v.reverse();
            v
        }
    };
    // Marca a primeira estável como recomendada quando o loader não diz.
    if !out.iter().any(|v| v.recommended)
        && let Some(v) = out.iter_mut().find(|v| v.stable) {
            v.recommended = true;
        }
    Ok(out)
}

#[derive(Deserialize)]
struct Promos {
    promos: std::collections::HashMap<String, String>,
}

/// Roda o instalador do Forge/NeoForge em modo cliente.
async fn run_installer(java: &Path, installer: &Path, root: &Path, log: &(dyn Fn(String) + Send + Sync)) -> Result<(), String> {
    // O instalador exige um launcher_profiles.json na pasta de destino.
    let profiles = root.join("launcher_profiles.json");
    if !profiles.exists() {
        tokio::fs::write(&profiles, br#"{"profiles":{}}"#).await.map_err(|e| e.to_string())?;
    }
    let mut last_err = String::new();
    for flag in ["--installClient", "--install-client"] {
        let mut cmd = tokio::process::Command::new(java);
        cmd.arg("-jar").arg(installer).arg(flag).arg(root).current_dir(root);
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000);
        let out = cmd.output().await.map_err(|e| format!("não foi possível rodar o instalador: {e}"))?;
        let text = String::from_utf8_lossy(&out.stdout).into_owned() + &String::from_utf8_lossy(&out.stderr);
        for line in text.lines().rev().take(3) {
            log(line.to_string());
        }
        if out.status.success() {
            return Ok(());
        }
        last_err = text.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("erro desconhecido").to_string();
    }
    Err(format!("o instalador falhou: {last_err}"))
}

/// Procura em `versions/` a pasta que o instalador criou.
fn find_installed(root: &Path, needles: &[&str]) -> Option<String> {
    std::fs::read_dir(root.join("versions"))
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .find(|name| needles.iter().all(|n| name.contains(n)) && root.join("versions").join(name).join(format!("{name}.json")).exists())
}

async fn installer_jar(client: &reqwest::Client, root: &Path, urls: &[String]) -> Result<PathBuf, String> {
    let mut last = String::new();
    for url in urls {
        match fetch(client, url, None).await {
            Ok(bytes) => {
                let name = url.rsplit('/').next().unwrap_or("installer.jar");
                let path = root.join("meta/installers").join(name);
                write_atomic(&path, &bytes, false).await.map_err(|e| e.to_string())?;
                return Ok(path);
            }
            Err(e) => last = e,
        }
    }
    Err(last)
}

/// Instala o loader e devolve qual versão abrir. `java` é usado pelos instaladores do Forge/NeoForge.
pub async fn install(
    client: &reqwest::Client,
    root: &Path,
    mc: &str,
    kind: LoaderType,
    wanted: Option<&str>,
    java: &Path,
    log: &(dyn Fn(String) + Send + Sync),
) -> Result<Option<Installed>, String> {
    match kind {
        LoaderType::Vanilla | LoaderType::OptiFine => Ok(None),
        LoaderType::Fabric => meta_profile(client, root, FABRIC_META, mc, wanted, "Fabric").await.map(Some),
        LoaderType::Quilt => meta_profile(client, root, QUILT_META, mc, wanted, "Quilt").await.map(Some),
        LoaderType::Forge => {
            let version = match wanted {
                Some(v) => v.to_string(),
                None => {
                    let p: Promos = get_json(client, FORGE_PROMOS).await?;
                    p.promos
                        .get(&format!("{mc}-recommended"))
                        .or_else(|| p.promos.get(&format!("{mc}-latest")))
                        .cloned()
                        .ok_or_else(|| format!("Forge não tem versão para o Minecraft {mc}"))?
                }
            };
            if let Some(id) = find_installed(root, &[mc, "forge", &version]) {
                return Ok(Some(Installed { version_id: id, loader_version: version }));
            }
            // Versões antigas usam o sufixo "-<mc>" no nome (ex.: 1.12.2-14.23.5.2860 vs 1.7.10-10.13.4.1614-1.7.10).
            let urls = [format!("{mc}-{version}"), format!("{mc}-{version}-{mc}")]
                .map(|full| format!("{FORGE_MAVEN}/{full}/forge-{full}-installer.jar"));
            let jar = installer_jar(client, root, &urls).await?;
            run_installer(java, &jar, root, log).await?;
            let id = find_installed(root, &[mc, "forge", &version]).ok_or("o Forge instalou, mas a versão não apareceu em versions/")?;
            Ok(Some(Installed { version_id: id, loader_version: version }))
        }
        LoaderType::NeoForge => {
            let version = match wanted {
                Some(v) => v.to_string(),
                None => {
                    let prefix = neoforge_prefix(mc).ok_or_else(|| format!("NeoForge não suporta o Minecraft {mc}"))?;
                    let xml = String::from_utf8(fetch(client, &format!("{NEOFORGE_MAVEN}/maven-metadata.xml"), None).await?).map_err(|e| e.to_string())?;
                    latest_from_metadata(&xml, &prefix).ok_or_else(|| format!("NeoForge não tem versão estável para o Minecraft {mc}"))?
                }
            };
            let id = format!("neoforge-{version}");
            if !root.join("versions").join(&id).join(format!("{id}.json")).exists() {
                let jar = installer_jar(client, root, &[format!("{NEOFORGE_MAVEN}/{version}/neoforge-{version}-installer.jar")]).await?;
                run_installer(java, &jar, root, log).await?;
            }
            let id = find_installed(root, &["neoforge", &version]).ok_or("o NeoForge instalou, mas a versão não apareceu em versions/")?;
            Ok(Some(Installed { version_id: id, loader_version: version }))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn neoforge_versions() {
        assert_eq!(neoforge_prefix("1.21.4").unwrap(), "21.4.");
        assert_eq!(neoforge_prefix("1.21").unwrap(), "21.0.");
        let xml = "<versions><version>21.4.10-beta</version><version>21.4.120</version><version>21.4.121</version><version>21.5.1</version><version>21.4.122-beta</version></versions>";
        assert_eq!(latest_from_metadata(xml, "21.4.").unwrap(), "21.4.121");
        assert!(latest_from_metadata(xml, "20.1.").is_none());
    }

    #[test]
    fn meta_picks_stable() {
        let list: Vec<MetaLoader> = serde_json::from_str(
            r#"[{"loader": {"version": "0.17.0-beta.1", "stable": false}}, {"loader": {"version": "0.16.9", "stable": true}}]"#,
        )
        .unwrap();
        assert_eq!(pick_meta(&list, None).unwrap(), "0.16.9");
        assert_eq!(pick_meta(&list, Some("0.17.0-beta.1")).unwrap(), "0.17.0-beta.1");
        let quilt: Vec<MetaLoader> = serde_json::from_str(r#"[{"loader": {"version": "0.27.1-beta.1"}}, {"loader": {"version": "0.26.4"}}]"#).unwrap();
        assert_eq!(pick_meta(&quilt, None).unwrap(), "0.26.4");
    }

    #[test]
    fn finds_forge_folder() {
        let d = tempfile::tempdir().unwrap();
        let id = "1.20.1-forge-47.3.0";
        std::fs::create_dir_all(d.path().join("versions").join(id)).unwrap();
        std::fs::write(d.path().join("versions").join(id).join(format!("{id}.json")), "{}").unwrap();
        assert_eq!(find_installed(d.path(), &["1.20.1", "forge", "47.3.0"]).unwrap(), id);
        assert!(find_installed(d.path(), &["1.20.1", "forge", "47.2.0"]).is_none());
    }
}
