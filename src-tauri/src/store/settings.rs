//! Configurações globais (`settings.json`). Campos ausentes no arquivo assumem o padrão,
//! então versões novas do launcher leem arquivos antigos sem quebrar.

use std::io;

use serde::{Deserialize, Serialize};

use super::{read_json, write_json, Store};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub general: General,
    pub java: Java,
    pub launch: Launch,
    pub downloads: Downloads,
    pub appearance: Appearance,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OnLaunch {
    /// Minimiza o launcher enquanto o jogo roda.
    Minimize,
    /// Deixa o launcher aberto.
    KeepOpen,
    /// Fecha o launcher.
    Close,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct General {
    pub language: String,
    pub on_launch: OnLaunch,
    pub start_with_system: bool,
    pub auto_update: bool,
    /// Aviso do Kill game já foi mostrado e o usuário marcou "não mostrar de novo".
    pub kill_warning_dismissed: bool,
    /// Nick usado no modo offline dos builds de desenvolvedor.
    pub dev_nickname: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Java {
    pub max_memory_mb: u32,
    pub min_memory_mb: u32,
    /// `None` = o launcher escolhe/baixa o Java certo para cada versão.
    pub java_path: Option<String>,
    pub jvm_args: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Launch {
    pub skip_mojang_intro: bool,
    pub fullscreen: bool,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ModSource {
    Modrinth,
    CurseForge,
    Both,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Downloads {
    pub concurrent: u8,
    pub mod_source: ModSource,
    pub auto_update_mods: bool,
    /// 0 = sem limite.
    pub speed_limit_mbps: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Appearance {
    pub ui_scale: u8,
    pub animations: bool,
    pub reduce_motion: bool,
    pub show_play_time: bool,
}

impl Default for General {
    fn default() -> Self {
        Self { language: "pt-BR".into(), on_launch: OnLaunch::KeepOpen, start_with_system: false, auto_update: true, kill_warning_dismissed: false, dev_nickname: "Jogador".into() }
    }
}
impl Default for Java {
    fn default() -> Self {
        Self { max_memory_mb: 6144, min_memory_mb: 2048, java_path: None, jvm_args: "-XX:+UseG1GC -XX:MaxGCPauseMillis=50".into() }
    }
}
impl Default for Launch {
    fn default() -> Self {
        Self { skip_mojang_intro: true, fullscreen: false, width: 1920, height: 1080 }
    }
}
impl Default for Downloads {
    fn default() -> Self {
        Self { concurrent: 8, mod_source: ModSource::Modrinth, auto_update_mods: false, speed_limit_mbps: 0 }
    }
}
impl Default for Appearance {
    fn default() -> Self {
        Self { ui_scale: 100, animations: true, reduce_motion: false, show_play_time: true }
    }
}

impl Settings {
    /// Corrige valores fora do intervalo antes de salvar.
    pub fn normalized(mut self) -> Self {
        self.java.max_memory_mb = self.java.max_memory_mb.clamp(1024, 65536);
        self.java.min_memory_mb = self.java.min_memory_mb.clamp(512, self.java.max_memory_mb);
        self.launch.width = self.launch.width.clamp(640, 7680);
        self.launch.height = self.launch.height.clamp(480, 4320);
        self.downloads.concurrent = self.downloads.concurrent.clamp(1, 32);
        self.appearance.ui_scale = self.appearance.ui_scale.clamp(75, 150);
        self
    }
}

impl Store {
    fn settings_path(&self) -> std::path::PathBuf {
        self.root().join("settings.json")
    }

    /// Lê as configurações; na primeira abertura cria o arquivo com os padrões.
    pub fn load_settings(&self) -> io::Result<Settings> {
        match read_json::<Settings>(&self.settings_path())? {
            Some(s) => Ok(s),
            None => {
                let s = Settings::default();
                write_json(&self.settings_path(), &s)?;
                Ok(s)
            }
        }
    }

    pub fn save_settings(&self, settings: Settings) -> io::Result<Settings> {
        let s = settings.normalized();
        write_json(&self.settings_path(), &s)?;
        Ok(s)
    }
}
