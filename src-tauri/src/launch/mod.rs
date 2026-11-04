//! Abre o jogo: extrai os nativos, monta o comando, roda o Java e repassa o log.

pub mod args;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;

use serde::Serialize;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::oneshot;

use crate::install::mojang::{merge, os_name, LoaderProfile, VersionJson};
use crate::store::instances::Instance;
use crate::store::settings::Settings;
use args::{Account, Options, Paths};

/// Jogos rodando: instância -> canal para matar o processo.
#[derive(Default)]
pub struct Running(pub Mutex<HashMap<String, oneshot::Sender<()>>>);

impl Running {
    pub fn is_running(&self, id: &str) -> bool {
        self.0.lock().unwrap().contains_key(id)
    }
    pub fn kill(&self, id: &str) -> bool {
        match self.0.lock().unwrap().remove(id) {
            Some(tx) => tx.send(()).is_ok(),
            None => false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub instance_id: String,
    pub line: String,
    pub stderr: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameState {
    pub instance_id: String,
    /// "running" ou "exited".
    pub state: &'static str,
    pub exit_code: Option<i32>,
    pub killed: bool,
    pub started_at: u64,
}

/// Executável do Java baixado pela Mojang (ou o do usuário).
pub fn java_executable(root: &Path, component: &str, custom: Option<&str>) -> PathBuf {
    if let Some(p) = custom.filter(|p| !p.trim().is_empty()) {
        return PathBuf::from(p.trim());
    }
    let base = root.join("runtime").join(component);
    if cfg!(windows) {
        base.join("bin").join("javaw.exe")
    } else if cfg!(target_os = "macos") {
        base.join("jre.bundle/Contents/Home/bin/java")
    } else {
        base.join("bin").join("java")
    }
}

/// Copia .dll/.so/.dylib dos jars de nativos para a pasta `natives`.
fn extract_natives(jars: &[PathBuf], dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    for jar in jars {
        let file = std::fs::File::open(jar).map_err(|e| format!("{}: {e}", jar.display()))?;
        let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("{}: {e}", jar.display()))?;
        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
            let name = entry.name().to_string();
            let is_native = [".dll", ".so", ".dylib", ".jnilib"].iter().any(|ext| name.ends_with(ext));
            if entry.is_dir() || name.starts_with("META-INF") || !is_native {
                continue;
            }
            let Some(file_name) = Path::new(&name).file_name() else { continue };
            let out = dir.join(file_name);
            if out.exists() {
                continue;
            }
            let mut f = std::fs::File::create(&out).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut f).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Junta configurações globais com as sobrescritas da instância.
pub fn resolve_options(settings: &Settings, inst: &Instance) -> (Options, Option<String>) {
    let o = &inst.overrides;
    let own = !inst.use_global_settings;
    let pick = |v: Option<u32>, g: u32| if own { v.unwrap_or(g) } else { g };
    let mut jvm: Vec<String> = settings.java.jvm_args.split_whitespace().map(String::from).collect();
    if own && let Some(extra) = &o.extra_jvm_args {
        jvm.extend(extra.split_whitespace().map(String::from));
    }
    let opts = Options {
        max_memory_mb: pick(o.max_memory_mb, settings.java.max_memory_mb),
        min_memory_mb: settings.java.min_memory_mb,
        jvm_args: jvm,
        fullscreen: if own { o.fullscreen.unwrap_or(settings.launch.fullscreen) } else { settings.launch.fullscreen },
        width: pick(o.width, settings.launch.width),
        height: pick(o.height, settings.launch.height),
        join_server: if own { o.join_server.clone() } else { None },
    };
    let java = if own { o.java_path.clone().or(settings.java.java_path.clone()) } else { settings.java.java_path.clone() };
    (opts, java)
}

pub struct Prepared {
    pub java: PathBuf,
    pub args: Vec<String>,
    pub game_dir: PathBuf,
}

/// Prepara tudo antes de abrir (arquivos já precisam estar instalados).
pub fn prepare(root: &Path, game_dir: &Path, inst: &Instance, settings: &Settings, account: &Account) -> Result<Prepared, String> {
    let vjson_path = root.join("versions").join(&inst.mc_version).join(format!("{}.json", inst.mc_version));
    let bytes = std::fs::read(&vjson_path).map_err(|_| "os arquivos do jogo ainda não foram baixados".to_string())?;
    let mut version: VersionJson = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    if let Some(lv) = inst.launch_version.as_deref().filter(|v| *v != inst.mc_version) {
        let ppath = root.join("versions").join(lv).join(format!("{lv}.json"));
        let raw = std::fs::read(&ppath).map_err(|_| "o loader ainda não foi instalado".to_string())?;
        let profile: LoaderProfile = serde_json::from_slice(&raw).map_err(|e| e.to_string())?;
        version = merge(version, profile);
    }
    // Natives e jar continuam na pasta do vanilla.
    let natives_version = inst.mc_version.clone();

    let natives_dir = root.join("versions").join(&natives_version).join("natives");
    extract_natives(&args::native_jars(&version, root, os_name()), &natives_dir)?;

    let (opts, custom_java) = resolve_options(settings, inst);
    let component = version.java_version.as_ref().map(|j| j.component.as_str()).unwrap_or("jre-legacy");
    let java = java_executable(root, component, custom_java.as_deref());
    if !java.exists() {
        return Err(format!("Java não encontrado em {}", java.display()));
    }
    std::fs::create_dir_all(game_dir).map_err(|e| e.to_string())?;
    let paths = Paths { root, game_dir, natives_dir: &natives_dir };
    Ok(Prepared { java, args: args::build(&version, &paths, account, &opts, os_name()), game_dir: game_dir.to_path_buf() })
}

/// Roda o jogo. `on_log` recebe cada linha; `on_state` recebe início e fim. Retorna quando o jogo fecha.
pub async fn run(
    prepared: Prepared,
    instance_id: String,
    kill_rx: oneshot::Receiver<()>,
    on_log: impl Fn(LogLine) + Send + Sync + Clone + 'static,
    on_state: impl Fn(GameState),
) -> Result<GameState, String> {
    let mut cmd = tokio::process::Command::new(&prepared.java);
    cmd.args(&prepared.args).current_dir(&prepared.game_dir).stdout(Stdio::piped()).stderr(Stdio::piped()).stdin(Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    let mut child = cmd.spawn().map_err(|e| format!("não foi possível abrir o Java: {e}"))?;

    let started_at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    on_state(GameState { instance_id: instance_id.clone(), state: "running", exit_code: None, killed: false, started_at });

    for (stream, is_err) in [(child.stdout.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>), false), (child.stderr.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>), true)] {
        if let Some(stream) = stream {
            let (on_log, id) = (on_log.clone(), instance_id.clone());
            tokio::spawn(async move {
                let mut lines = BufReader::new(stream).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    on_log(LogLine { instance_id: id.clone(), line, stderr: is_err });
                }
            });
        }
    }

    let mut killed = false;
    let status = tokio::select! {
        s = child.wait() => s,
        _ = kill_rx => {
            killed = true;
            let _ = child.kill().await;
            child.wait().await
        }
    }
    .map_err(|e| e.to_string())?;

    let end = GameState { instance_id, state: "exited", exit_code: status.code(), killed, started_at };
    on_state(end.clone());
    Ok(end)
}
