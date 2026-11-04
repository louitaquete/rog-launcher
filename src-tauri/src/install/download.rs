//! Downloads com conferência de SHA-1, várias tentativas e gravação atômica.

use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures::stream::{self, StreamExt};
use sha1::{Digest, Sha1};

use super::mojang::FileTask;

#[derive(Debug)]
pub enum DlError {
    Cancelled,
    Failed(String),
}

impl std::fmt::Display for DlError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DlError::Cancelled => write!(f, "download cancelado"),
            DlError::Failed(m) => write!(f, "{m}"),
        }
    }
}

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(concat!("RogLauncher/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(300))
        .build()
        .expect("cliente HTTP")
}

pub fn sha1_hex(bytes: &[u8]) -> String {
    hex::encode(Sha1::digest(bytes))
}

/// O arquivo já está no disco e íntegro? Confere o tamanho e, se tiver hash, o SHA-1.
pub async fn is_valid(path: &Path, size: u64, sha1: Option<&str>) -> bool {
    match tokio::fs::metadata(path).await {
        Ok(m) if size == 0 || m.len() == size => match sha1 {
            None => true,
            Some(expected) => tokio::fs::read(path).await.map(|b| sha1_hex(&b) == expected).unwrap_or(false),
        },
        _ => false,
    }
}

/// Baixa um arquivo para memória, conferindo o hash, com até 3 tentativas.
pub async fn fetch(client: &reqwest::Client, url: &str, sha1: Option<&str>) -> Result<Vec<u8>, String> {
    let mut last = String::new();
    for attempt in 0..3 {
        if attempt > 0 {
            tokio::time::sleep(Duration::from_millis(500 * attempt)).await;
        }
        let res = async {
            let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
            if !resp.status().is_success() {
                return Err(format!("HTTP {}", resp.status()));
            }
            let bytes = resp.bytes().await.map_err(|e| e.to_string())?.to_vec();
            if let Some(expected) = sha1 {
                let got = sha1_hex(&bytes);
                if got != expected {
                    return Err(format!("arquivo corrompido (SHA-1 {got}, esperado {expected})"));
                }
            }
            Ok(bytes)
        }
        .await;
        match res {
            Ok(b) => return Ok(b),
            Err(e) => last = e,
        }
    }
    Err(format!("{url}: {last}"))
}

pub async fn write_atomic(path: &Path, bytes: &[u8], executable: bool) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        tokio::fs::create_dir_all(dir).await?;
    }
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let tmp = path.with_file_name(format!("{name}.part"));
    tokio::fs::write(&tmp, bytes).await?;
    #[cfg(unix)]
    if executable {
        use std::os::unix::fs::PermissionsExt;
        tokio::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o755)).await?;
    }
    #[cfg(not(unix))]
    let _ = executable;
    tokio::fs::rename(&tmp, path).await
}

/// Contadores compartilhados que a tela de progresso lê.
#[derive(Default)]
pub struct Counters {
    pub files_done: AtomicU64,
    pub files_total: AtomicU64,
    pub bytes_done: AtomicU64,
    pub current: std::sync::Mutex<String>,
}

/// Baixa uma lista em paralelo. Arquivos que já existem íntegros são pulados.
pub async fn download_all(
    client: &reqwest::Client,
    root: &Path,
    tasks: Vec<FileTask>,
    concurrency: usize,
    counters: Arc<Counters>,
    cancel: Arc<AtomicBool>,
) -> Result<(), DlError> {
    counters.files_done.store(0, Ordering::Relaxed);
    counters.files_total.store(tasks.len() as u64, Ordering::Relaxed);

    let results: Vec<Result<(), DlError>> = stream::iter(tasks)
        .map(|task| {
            let (counters, cancel) = (counters.clone(), cancel.clone());
            async move {
                if cancel.load(Ordering::Relaxed) {
                    return Err(DlError::Cancelled);
                }
                let path = root.join(&task.path);
                // Assets já trazem o hash no nome: conferir só o tamanho é suficiente e bem mais rápido.
                let check_hash = if task.path.starts_with("assets/objects") { None } else { task.sha1.as_deref() };
                if !is_valid(&path, task.size, check_hash).await {
                    if let Some(name) = task.path.file_name() {
                        *counters.current.lock().unwrap() = name.to_string_lossy().into_owned();
                    }
                    let bytes = fetch(client, &task.url, task.sha1.as_deref()).await.map_err(DlError::Failed)?;
                    write_atomic(&path, &bytes, task.executable).await.map_err(|e| DlError::Failed(format!("{}: {e}", path.display())))?;
                    counters.bytes_done.fetch_add(bytes.len() as u64, Ordering::Relaxed);
                }
                counters.files_done.fetch_add(1, Ordering::Relaxed);
                Ok(())
            }
        })
        .buffer_unordered(concurrency.max(1))
        .collect()
        .await;

    if cancel.load(Ordering::Relaxed) {
        return Err(DlError::Cancelled);
    }
    results.into_iter().find(|r| r.is_err()).unwrap_or(Ok(()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash() {
        assert_eq!(sha1_hex(b"abc"), "a9993e364706816aba3e25717850c26c9cd0d89d");
    }

    #[tokio::test]
    async fn validity_and_atomic_write() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a/b/file.jar");
        assert!(!is_valid(&p, 3, None).await);
        write_atomic(&p, b"abc", false).await.unwrap();
        assert!(is_valid(&p, 3, Some("a9993e364706816aba3e25717850c26c9cd0d89d")).await);
        assert!(!is_valid(&p, 3, Some("deadbeef")).await);
        assert!(!is_valid(&p, 4, None).await);
        assert!(!dir.path().join("a/b/file.jar.part").exists());
    }

    #[tokio::test]
    async fn skips_valid_files_without_network() {
        let dir = tempfile::tempdir().unwrap();
        write_atomic(&dir.path().join("x/ok.bin"), b"abc", false).await.unwrap();
        let task = FileTask {
            url: "http://127.0.0.1:9/never".into(),
            path: "x/ok.bin".into(),
            sha1: Some("a9993e364706816aba3e25717850c26c9cd0d89d".into()),
            size: 3,
            executable: false,
        };
        let counters = Arc::new(Counters::default());
        download_all(&client(), dir.path(), vec![task], 4, counters.clone(), Arc::new(AtomicBool::new(false))).await.unwrap();
        assert_eq!(counters.files_done.load(Ordering::Relaxed), 1);
    }
}
