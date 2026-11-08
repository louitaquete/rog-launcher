// Instalador do Rog Launcher: baixa o instalador da release mais recente no GitHub e instala em silêncio.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::time::Duration;

use futures::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

const REPO: &str = "louitaquete/rog-launcher";
/// Nome usado pelo instalador NSIS do Tauri no registro de desinstalação.
const PRODUCT: &str = "Rog Launcher";

type Res<T> = Result<T, String>;

fn client() -> reqwest::Client {
    let mut b = reqwest::Client::builder();
    if let Some(p) = system_proxy().and_then(|p| reqwest::Proxy::all(p).ok()) {
        b = b.proxy(p);
    }
    b.user_agent("RogLauncherInstaller/0.1.9").connect_timeout(Duration::from_secs(15)).read_timeout(Duration::from_secs(30)).build().unwrap()
}

#[cfg(windows)]
fn system_proxy() -> Option<String> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    let key = RegKey::predef(HKEY_CURRENT_USER).open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Internet Settings").ok()?;
    let on: u32 = key.get_value("ProxyEnable").ok()?;
    if on == 0 {
        return None;
    }
    let s: String = key.get_value("ProxyServer").ok()?;
    let p = s.split(';').find_map(|p| p.strip_prefix("https=")).or_else(|| s.split(';').find_map(|p| p.strip_prefix("http="))).unwrap_or(&s).trim().to_string();
    (!p.is_empty()).then(|| if p.contains("://") { p } else { format!("http://{p}") })
}
#[cfg(not(windows))]
fn system_proxy() -> Option<String> {
    None
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Release {
    version: String,
    prerelease: bool,
    url: String,
    size: u64,
}

/// Versão mais nova (inclui pré-lançamentos) e o link do setup do launcher.
#[tauri::command]
async fn latest() -> Res<Release> {
    let r = client()
        .get(format!("https://api.github.com/repos/{REPO}/releases?per_page=5"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("sem conexão com o GitHub ({e})"))?;
    if !r.status().is_success() {
        return Err(format!("o GitHub respondeu {}", r.status()));
    }
    let list: serde_json::Value = r.json().await.map_err(|e| e.to_string())?;
    for rel in list.as_array().into_iter().flatten().filter(|r| r["draft"] != true) {
        // O setup do launcher termina em "-setup.exe"; o instalador (este app) não.
        if let Some(a) = rel["assets"].as_array().into_iter().flatten().find(|a| a["name"].as_str().is_some_and(|n| n.ends_with("-setup.exe"))) {
            return Ok(Release {
                version: rel["tag_name"].as_str().unwrap_or("").trim_start_matches('v').to_string(),
                prerelease: rel["prerelease"] == true,
                url: a["browser_download_url"].as_str().unwrap_or("").to_string(),
                size: a["size"].as_u64().unwrap_or(0),
            });
        }
    }
    Err("ainda não há uma versão publicada para baixar".into())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Installed {
    version: String,
    location: String,
}

#[cfg(windows)]
fn uninstall_key() -> Option<winreg::RegKey> {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};
    RegKey::predef(HKEY_CURRENT_USER).open_subkey(format!(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{PRODUCT}")).ok()
}

#[tauri::command]
fn installed() -> Option<Installed> {
    #[cfg(windows)]
    {
        let k = uninstall_key()?;
        let version: String = k.get_value("DisplayVersion").ok()?;
        let location: String = k.get_value("InstallLocation").unwrap_or_default();
        Some(Installed { version, location: location.trim_matches('"').to_string() })
    }
    #[cfg(not(windows))]
    None
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress {
    stage: &'static str,
    done: u64,
    total: u64,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Options {
    dir: Option<String>,
    desktop: bool,
    autostart: bool,
}

fn default_dir() -> PathBuf {
    std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir).join(PRODUCT)
}

#[tauri::command]
fn default_install_dir() -> String {
    default_dir().display().to_string()
}

/// Baixa o setup e roda em silêncio. Depois aplica as opções.
#[tauri::command]
async fn install(app: AppHandle, url: String, opts: Options) -> Res<()> {
    if !url.starts_with(&format!("https://github.com/{REPO}/releases/download/")) {
        return Err("link de download inválido".into());
    }
    let setup = std::env::temp_dir().join("rog-launcher-setup.exe");
    let r = client().get(&url).send().await.map_err(|e| format!("sem conexão com o GitHub ({e})"))?;
    if !r.status().is_success() {
        return Err(format!("o GitHub respondeu {}", r.status()));
    }
    let total = r.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(&setup).await.map_err(|e| e.to_string())?;
    let mut done = 0u64;
    let mut stream = r.bytes_stream();
    let mut last = std::time::Instant::now();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("o download parou ({e})"))?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        done += chunk.len() as u64;
        if last.elapsed() > Duration::from_millis(80) {
            last = std::time::Instant::now();
            let _ = app.emit("progress", Progress { stage: "download", done, total });
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    let _ = app.emit("progress", Progress { stage: "install", done: total, total });

    let dir = opts.dir.filter(|d| !d.trim().is_empty()).map(PathBuf::from).unwrap_or_else(default_dir);
    let status = tokio::process::Command::new(&setup)
        .arg("/S")
        .arg(format!("/D={}", dir.display())) // precisa ser o último argumento
        .status()
        .await
        .map_err(|e| format!("não deu para abrir o setup ({e})"))?;
    let _ = tokio::fs::remove_file(&setup).await;
    if !status.success() {
        return Err(format!("o setup terminou com erro ({status})"));
    }
    apply_options(&opts.desktop, &opts.autostart, &dir);
    Ok(())
}

#[allow(unused_variables)]
fn apply_options(desktop: &bool, autostart: &bool, dir: &std::path::Path) {
    #[cfg(windows)]
    {
        if !desktop {
            if let Some(d) = std::env::var_os("USERPROFILE") {
                let _ = std::fs::remove_file(PathBuf::from(d).join("Desktop").join(format!("{PRODUCT}.lnk")));
            }
        }
        use winreg::{enums::HKEY_CURRENT_USER, RegKey};
        if let Ok((run, _)) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run") {
            if *autostart {
                if let Some(exe) = launcher_exe(dir) {
                    let _ = run.set_value(PRODUCT, &format!("\"{}\"", exe.display()));
                }
            } else {
                let _ = run.delete_value(PRODUCT);
            }
        }
    }
}

/// O .exe do launcher na pasta de instalação.
fn launcher_exe(dir: &std::path::Path) -> Option<PathBuf> {
    std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe")) && !p.file_name().unwrap().to_string_lossy().to_lowercase().contains("uninstall"))
}

#[tauri::command]
fn open_launcher(app: AppHandle) -> Res<()> {
    let dir = installed().map(|i| PathBuf::from(i.location)).unwrap_or_else(default_dir);
    let exe = launcher_exe(&dir).ok_or("não achei o launcher instalado")?;
    std::process::Command::new(exe).spawn().map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
async fn uninstall() -> Res<()> {
    #[cfg(windows)]
    {
        let k = uninstall_key().ok_or("o launcher não está instalado")?;
        let cmd: String = k.get_value("UninstallString").map_err(|e| e.to_string())?;
        let exe = cmd.trim().trim_matches('"').to_string();
        let status = tokio::process::Command::new(exe).arg("/S").status().await.map_err(|e| e.to_string())?;
        if !status.success() {
            return Err(format!("o desinstalador terminou com erro ({status})"));
        }
        use winreg::{enums::HKEY_CURRENT_USER, RegKey};
        if let Ok(run) = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(r"Software\Microsoft\Windows\CurrentVersion\Run", winreg::enums::KEY_SET_VALUE) {
            let _ = run.delete_value(PRODUCT);
        }
        Ok(())
    }
    #[cfg(not(windows))]
    Err("só no Windows".into())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![latest, installed, default_install_dir, install, open_launcher, uninstall])
        .run(tauri::generate_context!())
        .expect("erro ao abrir o instalador");
}
