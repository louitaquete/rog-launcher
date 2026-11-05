//! Importar: .rog.zip, .mrpack (Modrinth), .zip do CurseForge e instâncias de outros launchers neste PC.

use std::io::Read;
use std::path::{Path, PathBuf};

use futures::{stream, StreamExt};
use serde::Serialize;
use serde_json::Value;

use crate::store::instances::{Instance, Kind, Loader, LoaderType, NewInstance};
use crate::store::Store;

/// Pastas do jogo que não valem a pena copiar.
const SKIP: [&str; 8] = ["logs", "crash-reports", ".cache", "versions", "libraries", "assets", "natives", ".fabric"];

fn copy_dir(from: &Path, to: &Path) -> Result<(), String> {
    std::fs::create_dir_all(to).map_err(|e| e.to_string())?;
    for e in std::fs::read_dir(from).map_err(|e| e.to_string())?.flatten() {
        let name = e.file_name();
        let n = name.to_string_lossy();
        if SKIP.contains(&n.as_ref()) {
            continue;
        }
        let (src, dst) = (e.path(), to.join(&name));
        if src.is_dir() {
            copy_dir(&src, &dst)?;
        } else {
            std::fs::copy(&src, &dst).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn create(store: &Store, name: &str, mc: &str, loader: LoaderType, loader_version: Option<String>) -> Result<Instance, String> {
    let vanilla = loader == LoaderType::Vanilla;
    store
        .create_instance(NewInstance {
            name: name.chars().take(64).collect(),
            kind: if vanilla { Kind::Vanilla } else { Kind::Mods },
            mc_version: mc.to_string(),
            loader: (!vanilla).then_some(Loader { kind: loader, version: loader_version }),
        })
        .map_err(|e| e.to_string())
}

fn extract_prefix(zip: &mut zip::ZipArchive<std::fs::File>, prefix: &str, to: &Path) -> Result<(), String> {
    for i in 0..zip.len() {
        let mut f = zip.by_index(i).map_err(|e| e.to_string())?;
        let Some(path) = f.enclosed_name() else { continue };
        let Ok(rel) = path.strip_prefix(prefix) else { continue };
        if rel.as_os_str().is_empty() {
            continue;
        }
        let dest = to.join(rel);
        if f.is_dir() {
            std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = dest.parent() {
                std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            let mut out = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, &mut out).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn read_entry(zip: &mut zip::ZipArchive<std::fs::File>, name: &str) -> Option<String> {
    let mut s = String::new();
    zip.by_name(name).ok()?.read_to_string(&mut s).ok()?;
    Some(s)
}

/// Baixa `(url, sha1, destino)` com 8 ao mesmo tempo.
async fn download(client: &reqwest::Client, files: Vec<(String, Option<String>, PathBuf)>) -> Result<(), String> {
    let results: Vec<Result<(), String>> = stream::iter(files)
        .map(|(url, sha1, dest)| async move {
            let bytes = crate::install::download::fetch(client, &url, sha1.as_deref()).await?;
            crate::install::download::write_atomic(&dest, &bytes, false).await.map_err(|e| e.to_string())
        })
        .buffer_unordered(8)
        .collect()
        .await;
    results.into_iter().collect()
}

/// Importa um arquivo: .rog.zip, .mrpack ou .zip de modpack do CurseForge.
pub async fn import_file(client: &reqwest::Client, store: &Store, path: &Path) -> Result<Instance, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "esse arquivo não é um .zip/.mrpack válido".to_string())?;

    if zip.by_name("instance.json").is_ok() {
        drop(zip);
        return crate::extras::import(store, path);
    }

    if let Some(index) = read_entry(&mut zip, "modrinth.index.json") {
        let v: Value = serde_json::from_str(&index).map_err(|e| format!("modrinth.index.json inválido: {e}"))?;
        let deps = &v["dependencies"];
        let mc = deps["minecraft"].as_str().ok_or("o modpack não diz a versão do Minecraft")?;
        let (loader, lv) = [("fabric-loader", LoaderType::Fabric), ("quilt-loader", LoaderType::Quilt), ("neoforge", LoaderType::NeoForge), ("forge", LoaderType::Forge)]
            .iter()
            .find_map(|(k, t)| deps[*k].as_str().map(|ver| (*t, Some(ver.to_string()))))
            .unwrap_or((LoaderType::Vanilla, None));
        let inst = create(store, v["name"].as_str().unwrap_or("Modpack"), mc, loader, lv)?;
        let game = store.game_dir(&inst.id).map_err(|e| e.to_string())?;
        let mut files = Vec::new();
        for f in v["files"].as_array().into_iter().flatten() {
            if f["env"]["client"].as_str() == Some("unsupported") {
                continue;
            }
            let rel = f["path"].as_str().unwrap_or_default();
            if rel.is_empty() || rel.contains("..") || rel.starts_with('/') || rel.contains(':') {
                continue;
            }
            let Some(url) = f["downloads"][0].as_str() else { continue };
            files.push((url.to_string(), f["hashes"]["sha1"].as_str().map(String::from), game.join(rel)));
        }
        let res = download(client, files).await;
        extract_prefix(&mut zip, "overrides", &game)?;
        extract_prefix(&mut zip, "client-overrides", &game)?;
        res?;
        return Ok(inst);
    }

    if let Some(manifest) = read_entry(&mut zip, "manifest.json") {
        let v: Value = serde_json::from_str(&manifest).map_err(|e| format!("manifest.json inválido: {e}"))?;
        let mc = v["minecraft"]["version"].as_str().ok_or("o modpack não diz a versão do Minecraft")?;
        let (loader, lv) = v["minecraft"]["modLoaders"][0]["id"].as_str().map(parse_loader_id).unwrap_or((LoaderType::Vanilla, None));
        let inst = create(store, v["name"].as_str().unwrap_or("Modpack"), mc, loader, lv)?;
        let game = store.game_dir(&inst.id).map_err(|e| e.to_string())?;
        let overrides = v["overrides"].as_str().unwrap_or("overrides").to_string();
        extract_prefix(&mut zip, &overrides, &game)?;
        let ids: Vec<(u64, u64)> = v["files"].as_array().into_iter().flatten().filter_map(|f| Some((f["projectID"].as_u64()?, f["fileID"].as_u64()?))).collect();
        let blocked = crate::curseforge::download_files(client, &game.join("mods"), &ids).await?;
        if !blocked.is_empty() {
            return Err(format!(
                "a instância foi criada, mas {} mod(s) precisam ser baixados à mão no site do CurseForge e colocados na pasta mods: {}",
                blocked.len(),
                blocked.join(", ")
            ));
        }
        return Ok(inst);
    }

    Err("não reconheci esse arquivo: use um .rog.zip, um .mrpack do Modrinth ou um .zip de modpack do CurseForge".into())
}

/// "forge-47.2.0", "fabric-0.15.7", "neoforge-20.4.80" → loader e versão.
fn parse_loader_id(id: &str) -> (LoaderType, Option<String>) {
    let (name, ver) = id.split_once('-').unwrap_or((id, ""));
    let t = match name {
        "forge" => LoaderType::Forge,
        "neoforge" => LoaderType::NeoForge,
        "fabric" => LoaderType::Fabric,
        "quilt" => LoaderType::Quilt,
        _ => return (LoaderType::Vanilla, None),
    };
    // CurseForge às vezes escreve "fabric-0.15.7-1.20.1".
    let ver = if matches!(t, LoaderType::Fabric | LoaderType::Quilt) { ver.split('-').next().unwrap_or(ver) } else { ver };
    (t, (!ver.is_empty()).then(|| ver.to_string()))
}

// ---------- Outros launchers neste PC ----------

#[derive(Debug, Clone, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    pub launcher: String,
    pub name: String,
    pub path: String,
    pub mc_version: String,
    pub loader: LoaderType,
    pub loader_version: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherScan {
    pub launcher: String,
    pub found: bool,
    pub instances: Vec<Found>,
}

fn prism_component(uid: &str) -> Option<LoaderType> {
    Some(match uid {
        "net.fabricmc.fabric-loader" => LoaderType::Fabric,
        "org.quiltmc.quilt-loader" => LoaderType::Quilt,
        "net.minecraftforge" => LoaderType::Forge,
        "net.neoforged" => LoaderType::NeoForge,
        _ => return None,
    })
}

fn scan_prism(launcher: &str, root: &Path) -> LauncherScan {
    let dir = root.join("instances");
    let mut list = Vec::new();
    for e in std::fs::read_dir(&dir).into_iter().flatten().flatten() {
        let p = e.path();
        let Ok(pack) = std::fs::read(p.join("mmc-pack.json")) else { continue };
        let Ok(pack) = serde_json::from_slice::<Value>(&pack) else { continue };
        let comps = pack["components"].as_array().cloned().unwrap_or_default();
        let mc = comps.iter().find(|c| c["uid"] == "net.minecraft").and_then(|c| c["version"].as_str()).unwrap_or_default().to_string();
        let (loader, lv) = comps
            .iter()
            .find_map(|c| prism_component(c["uid"].as_str()?).map(|t| (t, c["version"].as_str().map(String::from))))
            .unwrap_or((LoaderType::Vanilla, None));
        let cfg = std::fs::read_to_string(p.join("instance.cfg")).unwrap_or_default();
        let name = cfg.lines().find_map(|l| l.strip_prefix("name=")).map(String::from).unwrap_or_else(|| e.file_name().to_string_lossy().into());
        if !mc.is_empty() {
            list.push(Found { launcher: launcher.into(), name, path: p.display().to_string(), mc_version: mc, loader, loader_version: lv });
        }
    }
    LauncherScan { launcher: launcher.into(), found: dir.exists(), instances: list }
}

fn scan_curseforge(root: &Path) -> LauncherScan {
    let mut list = Vec::new();
    for e in std::fs::read_dir(root).into_iter().flatten().flatten() {
        let p = e.path();
        let Ok(b) = std::fs::read(p.join("minecraftinstance.json")) else { continue };
        let Ok(v) = serde_json::from_slice::<Value>(&b) else { continue };
        let mc = v["gameVersion"].as_str().unwrap_or_default().to_string();
        let (loader, lv) = v["baseModLoader"]["name"].as_str().map(parse_loader_id).unwrap_or((LoaderType::Vanilla, None));
        if !mc.is_empty() {
            let name = v["name"].as_str().map(String::from).unwrap_or_else(|| e.file_name().to_string_lossy().into());
            list.push(Found { launcher: "CurseForge".into(), name, path: p.display().to_string(), mc_version: mc, loader, loader_version: lv });
        }
    }
    LauncherScan { launcher: "CurseForge".into(), found: root.exists(), instances: list }
}

pub fn scan() -> Vec<LauncherScan> {
    let mut out = Vec::new();
    let data = dirs::data_dir().unwrap_or_default();
    let home = dirs::home_dir().unwrap_or_default();
    out.push(scan_prism("Prism Launcher", &data.join("PrismLauncher")));
    out.push(scan_curseforge(&home.join("curseforge").join("minecraft").join("Instances")));
    out.push(scan_prism("MultiMC", &home.join("MultiMC")));
    out
}

/// Copia uma instância de outro launcher (mods, mundos, configs) para uma nova instância do Rog.
pub fn import_found(store: &Store, f: Found) -> Result<Instance, String> {
    let src = PathBuf::from(&f.path);
    // Prism/MultiMC guardam o jogo em .minecraft ou minecraft; CurseForge, na própria pasta.
    let game_src = [src.join(".minecraft"), src.join("minecraft")].into_iter().find(|p| p.is_dir()).unwrap_or(src);
    let inst = create(store, &f.name, &f.mc_version, f.loader, f.loader_version)?;
    let game = store.game_dir(&inst.id).map_err(|e| e.to_string())?;
    copy_dir(&game_src, &game)?;
    // Arquivos de metadados dos outros launchers ficam de fora.
    for junk in ["minecraftinstance.json", "mmc-pack.json", "instance.cfg"] {
        let _ = std::fs::remove_file(game.join(junk));
    }
    Ok(inst)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loader_ids() {
        assert_eq!(parse_loader_id("forge-47.2.0"), (LoaderType::Forge, Some("47.2.0".into())));
        assert_eq!(parse_loader_id("fabric-0.15.7-1.20.1"), (LoaderType::Fabric, Some("0.15.7".into())));
        assert_eq!(parse_loader_id("neoforge-21.1.77"), (LoaderType::NeoForge, Some("21.1.77".into())));
    }
}
