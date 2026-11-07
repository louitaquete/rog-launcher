//! Iniciar com o Windows, exportar/importar instância e checagem de atualização.

use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::store::instances::{slugify, Instance};
use crate::store::Store;

/// Liga/desliga a entrada em HKCU\...\Run.
pub fn set_autostart(enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        let hkcu = winreg::RegKey::predef(HKEY_CURRENT_USER);
        let (run, _) = hkcu.create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run").map_err(|e| e.to_string())?;
        if enabled {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            run.set_value("Rog Launcher", &format!("\"{}\"", exe.display())).map_err(|e| e.to_string())?;
        } else {
            let _ = run.delete_value("Rog Launcher");
        }
    }
    #[cfg(not(windows))]
    let _ = enabled;
    Ok(())
}

fn add_dir(zip: &mut zip::ZipWriter<std::fs::File>, base: &Path, dir: &Path) -> Result<(), String> {
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for e in std::fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let path = e.path();
        let rel = path.strip_prefix(base).unwrap().to_string_lossy().replace('\\', "/");
        // Logs e caches não vão no pacote.
        if ["minecraft/logs", "minecraft/crash-reports", "minecraft/.cache"].contains(&rel.as_str()) {
            continue;
        }
        if path.is_dir() {
            add_dir(zip, base, &path)?;
        } else {
            zip.start_file(rel, opts).map_err(|e| e.to_string())?;
            let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
            std::io::copy(&mut f, zip).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Compacta a instância em Downloads/<nome>.rog.zip e devolve o caminho.
pub fn export(store: &Store, id: &str) -> Result<PathBuf, String> {
    let inst = store.get_instance(id).map_err(|e| e.to_string())?;
    let dir = store.instance_dir(id).map_err(|e| e.to_string())?;
    let out_dir = dirs::download_dir().unwrap_or_else(|| store.root().to_path_buf());
    let mut out = out_dir.join(format!("{}.rog.zip", slugify(&inst.name)));
    let mut n = 2;
    while out.exists() {
        out = out_dir.join(format!("{}-{n}.rog.zip", slugify(&inst.name)));
        n += 1;
    }
    let file = std::fs::File::create(&out).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    add_dir(&mut zip, &dir, &dir)?;
    zip.finish().map_err(|e| e.to_string())?;
    Ok(out)
}

/// Importa um .rog.zip exportado pelo launcher como nova instância.
pub fn import(store: &Store, path: &Path) -> Result<Instance, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "esse arquivo não é um .zip válido".to_string())?;
    let mut json = String::new();
    zip.by_name("instance.json")
        .map_err(|_| "esse .zip não é uma instância exportada pelo Rog (falta instance.json)".to_string())?
        .read_to_string(&mut json)
        .map_err(|e| e.to_string())?;
    let mut inst: Instance = serde_json::from_str(&json).map_err(|e| format!("instance.json inválido: {e}"))?;
    if inst.kind == crate::store::instances::Kind::Pvp {
        return Err("a instância PVP não pode ser importada".into());
    }

    let base = slugify(&inst.name);
    let mut id = base.clone();
    let mut n = 2;
    while store.instances_dir().join(&id).exists() || id == "pvp" {
        id = format!("{base}-{n}");
        n += 1;
    }
    let dir = store.instance_dir(&id).map_err(|e| e.to_string())?;
    for i in 0..zip.len() {
        let mut f = zip.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = f.enclosed_name() else { continue };
        let dest = dir.join(rel);
        if f.is_dir() {
            std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(p) = dest.parent() {
            std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        let mut out = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
        std::io::copy(&mut f, &mut out).map_err(|e| e.to_string())?;
        out.flush().ok();
    }
    std::fs::create_dir_all(dir.join("minecraft")).map_err(|e| e.to_string())?;
    inst.id = id;
    inst.last_played_at = None;
    inst.play_time_secs = 0;
    crate::store::write_json(&dir.join("instance.json"), &inst).map_err(|e| e.to_string())?;
    Ok(inst)
}

#[derive(Debug, Serialize)]
pub struct Update {
    pub version: String,
    pub url: String,
    /// Setup do launcher (…-setup.exe) da release, para atualizar pelo botão.
    pub download: Option<String>,
}

fn parse(v: &str) -> Vec<u64> {
    v.trim_start_matches('v').split(['.', '-']).map_while(|p| p.parse().ok()).collect()
}

/// Última release no GitHub, se for mais nova que esta versão.
pub async fn check_update(client: &reqwest::Client) -> Result<Option<Update>, String> {
    let r = client
        // Inclui pré-lançamentos (alpha/beta), que o /releases/latest ignora.
        .get("https://api.github.com/repos/louitaquete/rog-launcher/releases?per_page=5")
        .header("User-Agent", "rog-launcher")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if r.status().as_u16() == 404 {
        return Ok(None);
    }
    let list: serde_json::Value = r.json().await.map_err(|e| e.to_string())?;
    let Some(v) = list.as_array().and_then(|a| a.iter().find(|r| r["draft"] != true)) else { return Ok(None) };
    let tag = v["tag_name"].as_str().unwrap_or_default();
    if parse(tag) > parse(env!("CARGO_PKG_VERSION")) {
        let download = v["assets"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|a| a["name"].as_str().is_some_and(|n| n.ends_with("-setup.exe")))
            .and_then(|a| a["browser_download_url"].as_str())
            .map(String::from);
        return Ok(Some(Update { version: tag.trim_start_matches('v').into(), url: v["html_url"].as_str().unwrap_or_default().into(), download }));
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    #[test]
    fn version_order() {
        assert!(super::parse("v0.2.0") > super::parse("0.1.9"));
        assert!(super::parse("v0.1.0") == super::parse("0.1.0"));
    }
}

/// Baixa o setup da versão nova, instala em silêncio e abre o launcher de novo.
pub async fn apply_update(client: &reqwest::Client, url: &str) -> Result<(), String> {
    if !url.starts_with("https://github.com/louitaquete/rog-launcher/releases/download/") {
        return Err("link de atualização inválido".into());
    }
    let bytes = crate::install::download::fetch(client, url, None).await?;
    let setup = std::env::temp_dir().join("rog-launcher-update.exe");
    std::fs::write(&setup, bytes).map_err(|e| e.to_string())?;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    // O cmd espera o setup terminar (o launcher já fechou) e abre o launcher de novo.
    let script = format!("timeout /t 2 /nobreak >nul & \"{}\" /S & start \"\" \"{}\"", setup.display(), exe.display());
    let mut cmd = std::process::Command::new("cmd");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // raw_arg: o Rust escaparia as aspas com \" (que o cmd não entende) e o caminho virava "\\…".
        cmd.arg("/C").raw_arg(&script);
        cmd.creation_flags(0x0800_0000); // sem janela
    }
    #[cfg(not(windows))]
    cmd.args(["/C", &script]);
    cmd.spawn().map_err(|e| format!("não deu para rodar o instalador ({e})"))?;
    Ok(())
}
