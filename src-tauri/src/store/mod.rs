//! Dados locais do launcher.
//!
//! Tudo fica em `%APPDATA%\.Rog` (Windows), `~/.config/.Rog` (Linux) ou
//! `~/Library/Application Support/.Rog` (macOS):
//!
//! ```text
//! .Rog/
//! ├── settings.json            configurações globais
//! └── instances/
//!     └── <id>/
//!         ├── instance.json    nome, versão, loader, sobrescritas
//!         └── minecraft/       pasta do jogo (mundos, mods, configs)
//! ```

pub mod instances;
pub mod settings;

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{de::DeserializeOwned, Serialize};

pub const DIR_NAME: &str = ".Rog";

/// Raiz dos dados. Recebe o caminho por fora para os testes usarem uma pasta temporária.
#[derive(Debug, Clone)]
pub struct Store {
    root: PathBuf,
}

impl Store {
    pub fn new(root: impl Into<PathBuf>) -> io::Result<Self> {
        let root = root.into();
        fs::create_dir_all(root.join("instances"))?;
        Ok(Self { root })
    }

    /// Pasta padrão do sistema (`%APPDATA%\.Rog` no Windows).
    pub fn default_location() -> io::Result<Self> {
        let base = dirs::config_dir()
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "pasta de dados do sistema não encontrada"))?;
        Self::new(base.join(DIR_NAME))
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn instances_dir(&self) -> PathBuf {
        self.root.join("instances")
    }
}

/// Lê um JSON; arquivo ausente vira `None`.
pub(crate) fn read_json<T: DeserializeOwned>(path: &Path) -> io::Result<Option<T>> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, format!("{}: {e}", path.display()))),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// Grava um JSON de forma atômica (arquivo temporário + rename), para não corromper se o app fechar no meio.
pub(crate) fn write_json<T: Serialize>(path: &Path, value: &T) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    let data = serde_json::to_vec_pretty(value).map_err(io::Error::other)?;
    fs::write(&tmp, data)?;
    fs::rename(&tmp, path)
}
