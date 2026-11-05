//! Instâncias: uma pasta por instância em `instances/<id>/`, com `instance.json`
//! e a pasta do jogo `minecraft/`.

use std::fs;
use std::io;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use super::{read_json, write_json, Store};

/// Id da instância fixa do PVP, criada automaticamente.
pub const PVP_ID: &str = "pvp";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Vanilla,
    Mods,
    Pvp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LoaderType {
    Vanilla,
    Fabric,
    Forge,
    NeoForge,
    Quilt,
    OptiFine,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Loader {
    #[serde(rename = "type")]
    pub kind: LoaderType,
    /// Versão do loader (ex.: "0.16.9"). `None` = mais recente estável.
    pub version: Option<String>,
}

/// Valores que a instância pode sobrescrever quando `useGlobalSettings` está desligado.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Overrides {
    pub max_memory_mb: Option<u32>,
    pub java_path: Option<String>,
    /// Somados aos argumentos globais.
    pub extra_jvm_args: Option<String>,
    pub skip_mojang_intro: Option<bool>,
    pub fullscreen: Option<bool>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub join_server: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct InstanceSkin {
    /// Skin própria desta instância (vem desligada).
    pub enabled: bool,
    pub skin_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub kind: Kind,
    pub mc_version: String,
    pub loader: Loader,
    /// Imagem da capa dentro da pasta da instância (ex.: "cover.png").
    #[serde(default)]
    pub cover: Option<String>,
    pub created_at: u64,
    #[serde(default)]
    pub last_played_at: Option<u64>,
    #[serde(default)]
    pub play_time_secs: u64,
    #[serde(default = "yes")]
    pub use_global_settings: bool,
    #[serde(default)]
    pub overrides: Overrides,
    #[serde(default)]
    pub skin: InstanceSkin,
    /// Versão a abrir quando há loader (pasta em `versions/`, ex.: "fabric-loader-0.16.9-1.21.4").
    #[serde(default)]
    pub launch_version: Option<String>,
}

fn yes() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewInstance {
    pub name: String,
    pub kind: Kind,
    pub mc_version: String,
    pub loader: Option<Loader>,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn invalid(msg: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, msg.into())
}

/// "Meu Mundo: Mods!" -> "meu-mundo-mods". Acentos viram a letra sem acento.
pub fn slugify(name: &str) -> String {
    let mut out = String::new();
    for c in name.chars() {
        let c = match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' | 'Á' | 'À' | 'Â' | 'Ã' | 'Ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' | 'É' | 'È' | 'Ê' | 'Ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' | 'Í' | 'Ì' | 'Î' | 'Ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' | 'Ó' | 'Ò' | 'Ô' | 'Õ' | 'Ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' | 'Ú' | 'Ù' | 'Û' | 'Ü' => 'u',
            'ç' | 'Ç' => 'c',
            c => c,
        };
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    let out = out.trim_end_matches('-').to_string();
    if out.is_empty() { "instancia".into() } else { out.chars().take(48).collect() }
}

/// Aceita só ids que nós mesmos geramos — impede caminhos como "../".
fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

impl Store {
    pub fn instance_dir(&self, id: &str) -> io::Result<PathBuf> {
        if !valid_id(id) {
            return Err(invalid(format!("id de instância inválido: {id}")));
        }
        Ok(self.instances_dir().join(id))
    }

    /// Pasta do jogo da instância (equivale ao `.minecraft`).
    pub fn game_dir(&self, id: &str) -> io::Result<PathBuf> {
        Ok(self.instance_dir(id)?.join("minecraft"))
    }

    /// Todas as instâncias válidas. Pastas com `instance.json` quebrado são ignoradas.
    pub fn list_instances(&self) -> io::Result<Vec<Instance>> {
        let mut list = Vec::new();
        for entry in fs::read_dir(self.instances_dir())? {
            let path = entry?.path().join("instance.json");
            if let Ok(Some(inst)) = read_json::<Instance>(&path) {
                list.push(inst);
            }
        }
        list.sort_by(|a, b| b.last_played_at.cmp(&a.last_played_at).then(a.created_at.cmp(&b.created_at)));
        Ok(list)
    }

    pub fn get_instance(&self, id: &str) -> io::Result<Instance> {
        read_json(&self.instance_dir(id)?.join("instance.json"))?
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, format!("instância não encontrada: {id}")))
    }

    pub fn create_instance(&self, new: NewInstance) -> io::Result<Instance> {
        let name = new.name.trim();
        if name.is_empty() || name.chars().count() > 64 {
            return Err(invalid("o nome precisa ter entre 1 e 64 caracteres"));
        }
        if new.mc_version.trim().is_empty() {
            return Err(invalid("escolha uma versão do Minecraft"));
        }
        let loader = match new.kind {
            Kind::Vanilla => Loader { kind: LoaderType::Vanilla, version: None },
            Kind::Mods => match new.loader {
                Some(l) if l.kind != LoaderType::Vanilla => l,
                _ => return Err(invalid("instâncias com mods precisam de um loader")),
            },
            Kind::Pvp => return Err(invalid("a instância PVP é criada pelo launcher")),
        };

        let base = slugify(name);
        let mut id = base.clone();
        let mut n = 2;
        while self.instances_dir().join(&id).exists() || id == PVP_ID {
            id = format!("{base}-{n}");
            n += 1;
        }

        let inst = Instance {
            id: id.clone(),
            name: name.to_string(),
            kind: new.kind,
            mc_version: new.mc_version.trim().to_string(),
            loader,
            cover: None,
            created_at: now(),
            last_played_at: None,
            play_time_secs: 0,
            use_global_settings: true,
            overrides: Overrides::default(),
            skin: InstanceSkin::default(),
            launch_version: None,
        };
        fs::create_dir_all(self.game_dir(&id)?)?;
        write_json(&self.instance_dir(&id)?.join("instance.json"), &inst)?;
        Ok(inst)
    }

    /// Salva alterações (nome, sobrescritas, skin…). Id, tipo e data de criação não mudam.
    pub fn update_instance(&self, updated: Instance) -> io::Result<Instance> {
        let current = self.get_instance(&updated.id)?;
        let name = updated.name.trim();
        if name.is_empty() || name.chars().count() > 64 {
            return Err(invalid("o nome precisa ter entre 1 e 64 caracteres"));
        }
        let inst = Instance { name: name.to_string(), kind: current.kind, created_at: current.created_at, ..updated };
        write_json(&self.instance_dir(&inst.id)?.join("instance.json"), &inst)?;
        Ok(inst)
    }

    /// Troca o loader (Vanilla vira Mods e vice-versa). A versão instalada é refeita no próximo Jogar.
    pub fn change_loader(&self, id: &str, loader: Loader) -> io::Result<Instance> {
        let mut inst = self.get_instance(id)?;
        if inst.kind == Kind::Pvp {
            return Err(invalid("o loader do PVP é escolhido na aba Jogar"));
        }
        inst.kind = if loader.kind == LoaderType::Vanilla { Kind::Vanilla } else { Kind::Mods };
        inst.loader = loader;
        inst.launch_version = None;
        write_json(&self.instance_dir(id)?.join("instance.json"), &inst)?;
        Ok(inst)
    }

    pub fn delete_instance(&self, id: &str) -> io::Result<()> {
        if id == PVP_ID {
            return Err(invalid("a instância PVP não pode ser excluída"));
        }
        let dir = self.instance_dir(id)?;
        if !dir.join("instance.json").exists() {
            return Err(io::Error::new(io::ErrorKind::NotFound, format!("instância não encontrada: {id}")));
        }
        fs::remove_dir_all(dir)
    }

    /// Garante que a instância PVP existe (versão padrão 1.8.9 com OptiFine).
    pub fn ensure_pvp(&self) -> io::Result<()> {
        let path = self.instance_dir(PVP_ID)?.join("instance.json");
        if path.exists() {
            return Ok(());
        }
        let inst = Instance {
            id: PVP_ID.into(),
            name: "Minecraft PVP".into(),
            kind: Kind::Pvp,
            mc_version: "1.8.9".into(),
            loader: Loader { kind: LoaderType::OptiFine, version: None },
            cover: None,
            created_at: now(),
            last_played_at: None,
            play_time_secs: 0,
            use_global_settings: true,
            overrides: Overrides::default(),
            skin: InstanceSkin::default(),
            launch_version: None,
        };
        fs::create_dir_all(self.game_dir(PVP_ID)?)?;
        write_json(&path, &inst)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().unwrap();
        let s = Store::new(dir.path().join(".Rog")).unwrap();
        (dir, s)
    }

    fn vanilla(name: &str) -> NewInstance {
        NewInstance { name: name.into(), kind: Kind::Vanilla, mc_version: "1.21.4".into(), loader: None }
    }

    #[test]
    fn slug() {
        assert_eq!(slugify("Meu Mundo: Mods!"), "meu-mundo-mods");
        assert_eq!(slugify("Configurações Ação"), "configuracoes-acao");
        assert_eq!(slugify("!!!"), "instancia");
    }

    #[test]
    fn create_list_update_delete() {
        let (_d, s) = store();
        let a = s.create_instance(vanilla("Hardcore")).unwrap();
        let b = s.create_instance(vanilla("Hardcore")).unwrap();
        assert_eq!((a.id.as_str(), b.id.as_str()), ("hardcore", "hardcore-2"));
        assert!(s.game_dir(&a.id).unwrap().is_dir());
        assert_eq!(s.list_instances().unwrap().len(), 2);

        let mut renamed = a.clone();
        renamed.name = "  Hardcore 2.0 ".into();
        renamed.kind = Kind::Mods; // não deve mudar
        let r = s.update_instance(renamed).unwrap();
        assert_eq!(r.name, "Hardcore 2.0");
        assert_eq!(r.kind, Kind::Vanilla);

        s.delete_instance("hardcore").unwrap();
        assert_eq!(s.list_instances().unwrap().len(), 1);
    }

    #[test]
    fn mods_requires_loader_and_pvp_is_protected() {
        let (_d, s) = store();
        let mut n = vanilla("Mods");
        n.kind = Kind::Mods;
        assert!(s.create_instance(n.clone()).is_err());
        n.loader = Some(Loader { kind: LoaderType::Fabric, version: None });
        assert_eq!(s.create_instance(n).unwrap().loader.kind, LoaderType::Fabric);

        s.ensure_pvp().unwrap();
        s.ensure_pvp().unwrap();
        assert!(s.delete_instance(PVP_ID).is_err());
        assert!(s.create_instance(vanilla("pvp")).unwrap().id != PVP_ID);
    }

    #[test]
    fn rejects_path_tricks() {
        let (_d, s) = store();
        assert!(s.instance_dir("../fora").is_err());
        assert!(s.delete_instance("..").is_err());
    }

    #[test]
    fn settings_defaults_and_partial_file() {
        let (_d, s) = store();
        assert_eq!(s.load_settings().unwrap().java.max_memory_mb, 6144);
        std::fs::write(s.root().join("settings.json"), r#"{"java":{"maxMemoryMb":999999}}"#).unwrap();
        let loaded = s.load_settings().unwrap();
        assert_eq!(loaded.java.max_memory_mb, 999999);
        assert!(loaded.launch.skip_mojang_intro);
        assert_eq!(s.save_settings(loaded).unwrap().java.max_memory_mb, 65536);
    }
}
