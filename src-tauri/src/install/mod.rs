//! Instalação dos arquivos do jogo, na mesma ordem do launcher oficial:
//! Java → versão (json + jar) → bibliotecas → assets.
//!
//! Os arquivos são compartilhados entre instâncias, na raiz `.Rog`:
//! `runtime/`, `versions/<id>/`, `libraries/`, `assets/`. Rodar de novo só baixa o que falta.

pub mod download;
pub mod mojang;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use serde::Serialize;

use download::{download_all, fetch, is_valid, write_atomic, Counters, DlError};
use mojang::*;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Stage {
    Java,
    Version,
    Libraries,
    Assets,
    Done,
    Cancelled,
    Error,
}

/// Enviado ao front no evento `install-progress`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub instance_id: String,
    pub stage: Stage,
    pub files_done: u64,
    pub files_total: u64,
    pub bytes_per_sec: u64,
    pub current: String,
    pub error: Option<String>,
}

/// Instalações em andamento, com a flag de cancelar de cada uma.
#[derive(Default)]
pub struct Installs(Mutex<HashMap<String, Arc<AtomicBool>>>);

impl Installs {
    pub fn start(&self, id: &str) -> Option<Arc<AtomicBool>> {
        let mut map = self.0.lock().unwrap();
        if map.contains_key(id) {
            return None;
        }
        let flag = Arc::new(AtomicBool::new(false));
        map.insert(id.to_string(), flag.clone());
        Some(flag)
    }
    pub fn finish(&self, id: &str) {
        self.0.lock().unwrap().remove(id);
    }
    pub fn cancel(&self, id: &str) -> bool {
        match self.0.lock().unwrap().get(id) {
            Some(f) => {
                f.store(true, Ordering::Relaxed);
                true
            }
            None => false,
        }
    }
}

fn fail(e: impl std::fmt::Display) -> DlError {
    DlError::Failed(e.to_string())
}

/// Baixa um JSON pequeno com cache em disco. Sem internet, usa o cache se existir.
async fn cached_json(client: &reqwest::Client, url: &str, cache: &Path, max_age: Duration) -> Result<Vec<u8>, String> {
    let fresh = tokio::fs::metadata(cache)
        .await
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| SystemTime::now().duration_since(t).ok())
        .is_some_and(|age| age < max_age);
    if fresh && let Ok(b) = tokio::fs::read(cache).await {
        return Ok(b);
    }
    match fetch(client, url, None).await {
        Ok(bytes) => {
            let _ = write_atomic(cache, &bytes, false).await;
            Ok(bytes)
        }
        Err(e) => tokio::fs::read(cache).await.map_err(|_| format!("sem conexão com a Mojang ({e})")),
    }
}

/// Lista de versões oficiais (cache de 1 hora em `meta/`).
pub async fn version_manifest(root: &Path) -> Result<VersionManifest, String> {
    let client = download::client();
    let bytes = cached_json(&client, VERSION_MANIFEST_URL, &root.join("meta/version_manifest_v2.json"), Duration::from_secs(3600)).await?;
    serde_json::from_slice(&bytes).map_err(|e| format!("lista de versões inválida: {e}"))
}

/// Baixa um arquivo único se estiver faltando ou corrompido e devolve o conteúdo.
async fn ensure_file(client: &reqwest::Client, path: &Path, url: &str, sha1: &str, size: u64) -> Result<Vec<u8>, DlError> {
    if is_valid(path, size, Some(sha1)).await {
        return tokio::fs::read(path).await.map_err(fail);
    }
    let bytes = fetch(client, url, Some(sha1)).await.map_err(DlError::Failed)?;
    write_atomic(path, &bytes, false).await.map_err(fail)?;
    Ok(bytes)
}

pub struct Job {
    pub root: PathBuf,
    pub instance_id: String,
    pub mc_version: String,
    pub concurrency: usize,
    pub cancel: Arc<AtomicBool>,
}

/// Instala tudo. `emit` recebe o progresso (chamado várias vezes por segundo).
pub async fn install(job: Job, emit: impl Fn(Progress) + Send + Sync + 'static) -> Result<(), String> {
    let counters = Arc::new(Counters::default());
    let stage = Arc::new(Mutex::new(Stage::Java));
    let emit = Arc::new(emit);

    // Envia o progresso a cada 150 ms, com a velocidade média do último segundo.
    let ticker = {
        let (counters, stage, emit, id) = (counters.clone(), stage.clone(), emit.clone(), job.instance_id.clone());
        tokio::spawn(async move {
            let mut last = (Instant::now(), 0u64);
            let mut speed = 0u64;
            loop {
                tokio::time::sleep(Duration::from_millis(150)).await;
                let bytes = counters.bytes_done.load(Ordering::Relaxed);
                let dt = last.0.elapsed().as_secs_f64();
                if dt >= 1.0 {
                    speed = ((bytes.saturating_sub(last.1)) as f64 / dt) as u64;
                    last = (Instant::now(), bytes);
                }
                emit(Progress {
                    instance_id: id.clone(),
                    stage: *stage.lock().unwrap(),
                    files_done: counters.files_done.load(Ordering::Relaxed),
                    files_total: counters.files_total.load(Ordering::Relaxed),
                    bytes_per_sec: speed,
                    current: counters.current.lock().unwrap().clone(),
                    error: None,
                });
            }
        })
    };

    let result = run(&job, &counters, &stage).await;
    ticker.abort();

    let (final_stage, error) = match &result {
        Ok(()) => (Stage::Done, None),
        Err(DlError::Cancelled) => (Stage::Cancelled, None),
        Err(e) => (Stage::Error, Some(e.to_string())),
    };
    emit(Progress {
        instance_id: job.instance_id.clone(),
        stage: final_stage,
        files_done: counters.files_done.load(Ordering::Relaxed),
        files_total: counters.files_total.load(Ordering::Relaxed),
        bytes_per_sec: 0,
        current: String::new(),
        error: error.clone(),
    });
    match result {
        Ok(()) | Err(DlError::Cancelled) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

async fn run(job: &Job, counters: &Arc<Counters>, stage: &Arc<Mutex<Stage>>) -> Result<(), DlError> {
    let client = download::client();
    let root = &job.root;
    let set = |s: Stage| *stage.lock().unwrap() = s;
    let batch = |tasks: Vec<FileTask>| download_all(&client, root, tasks, job.concurrency, counters.clone(), job.cancel.clone());

    // Arquivo da versão: ele diz qual Java, bibliotecas e assets usar.
    set(Stage::Java);
    let manifest = version_manifest(root).await.map_err(DlError::Failed)?;
    let entry = manifest
        .versions
        .iter()
        .find(|v| v.id == job.mc_version)
        .ok_or_else(|| DlError::Failed(format!("versão {} não existe na lista da Mojang", job.mc_version)))?;
    let vdir = root.join("versions").join(&entry.id);
    let vjson = ensure_file(&client, &vdir.join(format!("{}.json", entry.id)), &entry.url, &entry.sha1, 0).await?;
    let version: VersionJson = serde_json::from_slice(&vjson).map_err(|e| fail(format!("arquivo da versão inválido: {e}")))?;

    // 1. Java
    let component = version.java_version.as_ref().map(|j| j.component.clone()).unwrap_or_else(|| "jre-legacy".into());
    let runtimes_raw = cached_json(&client, JAVA_RUNTIMES_URL, &root.join("meta/java_runtimes.json"), Duration::from_secs(86_400))
        .await
        .map_err(DlError::Failed)?;
    let runtimes: JavaRuntimes = serde_json::from_slice(&runtimes_raw).map_err(fail)?;
    let jentry = runtimes
        .get(java_platform())
        .and_then(|p| p.get(&component))
        .and_then(|l| l.first())
        .ok_or_else(|| fail(format!("Java {component} não está disponível para {}", java_platform())))?;
    let jm = &jentry.manifest;
    let jbytes = ensure_file(&client, &root.join("meta/java").join(format!("{component}.json")), &jm.url, &jm.sha1, jm.size).await?;
    let jmanifest: JavaManifest = serde_json::from_slice(&jbytes).map_err(fail)?;
    batch(java_tasks(&jmanifest, &component)).await?;

    // 2. Versão: jar do jogo + configuração de log
    set(Stage::Version);
    let mut vtasks = vec![FileTask {
        url: version.downloads.client.url.clone(),
        path: PathBuf::from("versions").join(&version.id).join(format!("{}.jar", version.id)),
        sha1: Some(version.downloads.client.sha1.clone()),
        size: version.downloads.client.size,
        executable: false,
    }];
    if let Some(log) = &version.logging {
        let f = &log.client.file;
        vtasks.push(FileTask { url: f.url.clone(), path: PathBuf::from("assets/log_configs").join(&f.id), sha1: Some(f.sha1.clone()), size: f.size, executable: false });
    }
    batch(vtasks).await?;

    // 3. Bibliotecas
    set(Stage::Libraries);
    batch(library_tasks(&version, os_name())).await?;

    // 4. Assets
    set(Stage::Assets);
    let ai = &version.asset_index;
    let ibytes = ensure_file(&client, &root.join("assets/indexes").join(format!("{}.json", ai.id)), &ai.url, &ai.sha1, ai.size).await?;
    let index: AssetIndex = serde_json::from_slice(&ibytes).map_err(fail)?;
    batch(asset_tasks(&index)).await?;

    set(Stage::Done);
    Ok(())
}
