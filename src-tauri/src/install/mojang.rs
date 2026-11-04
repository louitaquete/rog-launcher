//! Formatos dos arquivos da Mojang e a lógica que transforma cada um em uma lista de downloads.
//! Tudo aqui é puro (sem rede), para dar para testar com JSON de exemplo.

use std::collections::BTreeMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub const VERSION_MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
pub const JAVA_RUNTIMES_URL: &str =
    "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";
pub const RESOURCES_URL: &str = "https://resources.download.minecraft.net";

// ---------------------------------------------------------------- lista de versões

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionManifest {
    pub latest: Latest,
    pub versions: Vec<VersionEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Latest {
    pub release: String,
    pub snapshot: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub url: String,
    pub sha1: String,
    pub release_time: String,
}

// ---------------------------------------------------------------- arquivo da versão

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionJson {
    pub id: String,
    pub asset_index: AssetIndexRef,
    pub downloads: VersionDownloads,
    #[serde(default)]
    pub java_version: Option<JavaVersion>,
    #[serde(default)]
    pub libraries: Vec<Library>,
    #[serde(default)]
    pub logging: Option<Logging>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetIndexRef {
    pub id: String,
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct VersionDownloads {
    pub client: Artifact,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaVersion {
    pub component: String,
    /// Vai ser usado ao abrir o jogo com um Java do usuário.
    #[allow(dead_code)]
    pub major_version: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Artifact {
    #[serde(default)]
    pub path: Option<String>,
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Library {
    pub name: String,
    #[serde(default)]
    pub downloads: Option<LibraryDownloads>,
    #[serde(default)]
    pub rules: Vec<Rule>,
    /// Formato antigo de nativos: `{"windows": "natives-windows-${arch}"}`.
    #[serde(default)]
    pub natives: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LibraryDownloads {
    #[serde(default)]
    pub artifact: Option<Artifact>,
    #[serde(default)]
    pub classifiers: BTreeMap<String, Artifact>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Rule {
    pub action: String,
    #[serde(default)]
    pub os: Option<OsRule>,
    /// Regras com `features` (demo, resolução customizada…) só valem para argumentos; aqui são ignoradas.
    #[serde(default)]
    pub features: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OsRule {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub arch: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Logging {
    pub client: LoggingClient,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LoggingClient {
    pub file: LoggingFile,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LoggingFile {
    pub id: String,
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetIndex {
    pub objects: BTreeMap<String, AssetObject>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssetObject {
    pub hash: String,
    pub size: u64,
}

// ---------------------------------------------------------------- Java (runtime da Mojang)

/// `all.json`: plataforma -> componente -> lista (normalmente 1 item).
pub type JavaRuntimes = BTreeMap<String, BTreeMap<String, Vec<JavaRuntimeEntry>>>;

#[derive(Debug, Clone, Deserialize)]
pub struct JavaRuntimeEntry {
    pub manifest: Artifact,
}

#[derive(Debug, Clone, Deserialize)]
pub struct JavaManifest {
    pub files: BTreeMap<String, JavaFile>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct JavaFile {
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub executable: bool,
    #[serde(default)]
    pub downloads: Option<JavaFileDownloads>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct JavaFileDownloads {
    pub raw: Artifact,
}

// ---------------------------------------------------------------- sistema atual

/// Nome do sistema como a Mojang usa nas regras.
pub fn os_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

/// Plataforma no `all.json` do Java.
pub fn java_platform() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => "windows-x64",
        ("windows", "aarch64") => "windows-arm64",
        ("windows", _) => "windows-x86",
        ("macos", "aarch64") => "mac-os-arm64",
        ("macos", _) => "mac-os",
        ("linux", "x86") => "linux-i386",
        _ => "linux",
    }
}

// ---------------------------------------------------------------- regras e bibliotecas

/// Avalia as regras de uma biblioteca para o sistema `os`. Sem regras = permitido.
pub fn rules_allow(rules: &[Rule], os: &str) -> bool {
    if rules.is_empty() {
        return true;
    }
    let mut allowed = false;
    for rule in rules {
        if rule.features.is_some() {
            continue;
        }
        let matches = match &rule.os {
            None => true,
            Some(o) => {
                o.name.as_deref().is_none_or(|n| n == os)
                    && o.arch.as_deref().is_none_or(|a| a == "x86" && std::env::consts::ARCH == "x86")
            }
        };
        if matches {
            allowed = rule.action == "allow";
        }
    }
    allowed
}

/// Um arquivo a baixar: de onde, para onde e como conferir.
#[derive(Debug, Clone, PartialEq)]
pub struct FileTask {
    pub url: String,
    /// Caminho relativo à raiz `.Rog`.
    pub path: PathBuf,
    pub sha1: Option<String>,
    pub size: u64,
    pub executable: bool,
}

impl FileTask {
    fn from_artifact(a: &Artifact, path: PathBuf) -> Self {
        Self { url: a.url.clone(), path, sha1: Some(a.sha1.clone()), size: a.size, executable: false }
    }
}

/// Caminho Maven: `com.mojang:brigadier:1.0.18` -> `com/mojang/brigadier/1.0.18/brigadier-1.0.18.jar`.
pub fn maven_path(name: &str, classifier: Option<&str>) -> Option<String> {
    let mut parts = name.split(':');
    let (group, artifact, version) = (parts.next()?, parts.next()?, parts.next()?);
    let classifier = classifier.map(str::to_string).or_else(|| parts.next().map(str::to_string));
    let file = match classifier {
        Some(c) => format!("{artifact}-{version}-{c}.jar"),
        None => format!("{artifact}-{version}.jar"),
    };
    Some(format!("{}/{artifact}/{version}/{file}", group.replace('.', "/")))
}

/// Bibliotecas (e nativos) desta versão que valem para o sistema `os`.
pub fn library_tasks(version: &VersionJson, os: &str) -> Vec<FileTask> {
    let arch_bits = if cfg!(target_pointer_width = "64") { "64" } else { "32" };
    let mut out = Vec::new();
    for lib in &version.libraries {
        if !rules_allow(&lib.rules, os) {
            continue;
        }
        let Some(dl) = &lib.downloads else { continue };
        if let Some(a) = &dl.artifact {
            let path = a.path.clone().or_else(|| maven_path(&lib.name, None));
            if let Some(p) = path {
                out.push(FileTask::from_artifact(a, PathBuf::from("libraries").join(p)));
            }
        }
        // Nativos no formato antigo (até ~1.18): classifier por sistema.
        if let Some(key) = lib.natives.get(os) {
            let key = key.replace("${arch}", arch_bits);
            if let Some(a) = dl.classifiers.get(&key) {
                let path = a.path.clone().or_else(|| maven_path(&lib.name, Some(&key)));
                if let Some(p) = path {
                    out.push(FileTask::from_artifact(a, PathBuf::from("libraries").join(p)));
                }
            }
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out.dedup_by(|a, b| a.path == b.path);
    out
}

/// Objetos de asset ficam em `assets/objects/<2 primeiros>/<hash>`.
pub fn asset_tasks(index: &AssetIndex) -> Vec<FileTask> {
    let mut seen = std::collections::HashSet::new();
    index
        .objects
        .values()
        .filter(|o| seen.insert(o.hash.clone()))
        .map(|o| {
            let prefix = &o.hash[..2];
            FileTask {
                url: format!("{RESOURCES_URL}/{prefix}/{}", o.hash),
                path: PathBuf::from("assets/objects").join(prefix).join(&o.hash),
                sha1: Some(o.hash.clone()),
                size: o.size,
                executable: false,
            }
        })
        .collect()
}

/// Arquivos do Java para a pasta `runtime/<componente>/`.
pub fn java_tasks(manifest: &JavaManifest, component: &str) -> Vec<FileTask> {
    manifest
        .files
        .iter()
        .filter(|(_, f)| f.kind == "file")
        .filter_map(|(path, f)| {
            let raw = &f.downloads.as_ref()?.raw;
            Some(FileTask {
                url: raw.url.clone(),
                path: PathBuf::from("runtime").join(component).join(path),
                sha1: Some(raw.sha1.clone()),
                size: raw.size,
                executable: f.executable,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const VERSION: &str = r#"{
      "id": "1.21.4",
      "assetIndex": {"id": "19", "sha1": "aa", "size": 10, "url": "https://x/19.json"},
      "downloads": {"client": {"sha1": "cc", "size": 100, "url": "https://x/client.jar"}},
      "javaVersion": {"component": "java-runtime-delta", "majorVersion": 21},
      "libraries": [
        {"name": "com.mojang:brigadier:1.0.18",
         "downloads": {"artifact": {"path": "com/mojang/brigadier/1.0.18/brigadier-1.0.18.jar", "sha1": "b1", "size": 1, "url": "https://l/b.jar"}}},
        {"name": "org.lwjgl:lwjgl:3.3.3:natives-windows",
         "downloads": {"artifact": {"path": "org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar", "sha1": "w1", "size": 1, "url": "https://l/w.jar"}},
         "rules": [{"action": "allow", "os": {"name": "windows"}}]},
        {"name": "org.lwjgl:lwjgl:3.3.3:natives-linux",
         "downloads": {"artifact": {"path": "org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-linux.jar", "sha1": "l1", "size": 1, "url": "https://l/l.jar"}},
         "rules": [{"action": "allow", "os": {"name": "linux"}}]},
        {"name": "ca.weblite:java-objc-bridge:1.1",
         "downloads": {"artifact": {"path": "ca/weblite/java-objc-bridge/1.1/java-objc-bridge-1.1.jar", "sha1": "o1", "size": 1, "url": "https://l/o.jar"}},
         "rules": [{"action": "allow"}, {"action": "disallow", "os": {"name": "windows"}}]},
        {"name": "org.lwjgl.lwjgl:lwjgl-platform:2.9.4",
         "natives": {"windows": "natives-windows", "linux": "natives-linux"},
         "downloads": {"classifiers": {
            "natives-windows": {"path": "org/lwjgl/lwjgl/lwjgl-platform/2.9.4/lwjgl-platform-2.9.4-natives-windows.jar", "sha1": "n1", "size": 1, "url": "https://l/nw.jar"},
            "natives-linux": {"path": "org/lwjgl/lwjgl/lwjgl-platform/2.9.4/lwjgl-platform-2.9.4-natives-linux.jar", "sha1": "n2", "size": 1, "url": "https://l/nl.jar"}}}}
      ]
    }"#;

    fn names(tasks: &[FileTask]) -> Vec<String> {
        tasks.iter().map(|t| t.path.file_name().unwrap().to_string_lossy().into_owned()).collect()
    }

    #[test]
    fn libraries_for_windows() {
        let v: VersionJson = serde_json::from_str(VERSION).unwrap();
        let n = names(&library_tasks(&v, "windows"));
        assert!(n.contains(&"brigadier-1.0.18.jar".into()));
        assert!(n.contains(&"lwjgl-3.3.3-natives-windows.jar".into()));
        assert!(n.contains(&"lwjgl-platform-2.9.4-natives-windows.jar".into()));
        assert!(!n.iter().any(|x| x.contains("linux")));
        assert!(!n.contains(&"java-objc-bridge-1.1.jar".into()));
    }

    #[test]
    fn libraries_for_linux() {
        let v: VersionJson = serde_json::from_str(VERSION).unwrap();
        let n = names(&library_tasks(&v, "linux"));
        assert!(n.contains(&"lwjgl-3.3.3-natives-linux.jar".into()));
        assert!(n.contains(&"java-objc-bridge-1.1.jar".into()));
        assert!(!n.iter().any(|x| x.contains("windows")));
    }

    #[test]
    fn maven() {
        assert_eq!(maven_path("com.mojang:brigadier:1.0.18", None).unwrap(), "com/mojang/brigadier/1.0.18/brigadier-1.0.18.jar");
        assert_eq!(maven_path("a.b:c:1:natives-x", None).unwrap(), "a/b/c/1/c-1-natives-x.jar");
    }

    #[test]
    fn assets_dedupe_and_path() {
        let idx: AssetIndex = serde_json::from_str(
            r#"{"objects": {"a.ogg": {"hash": "abcdef", "size": 3}, "b.ogg": {"hash": "abcdef", "size": 3}, "c.png": {"hash": "12ffff", "size": 5}}}"#,
        )
        .unwrap();
        let t = asset_tasks(&idx);
        assert_eq!(t.len(), 2);
        assert!(t.iter().any(|x| x.path == std::path::Path::new("assets/objects/ab/abcdef") && x.url.ends_with("/ab/abcdef")));
    }

    #[test]
    fn java_files_only() {
        let m: JavaManifest = serde_json::from_str(
            r#"{"files": {
              "bin": {"type": "directory"},
              "bin/java": {"type": "file", "executable": true, "downloads": {"raw": {"sha1": "j", "size": 9, "url": "https://j/java"}}},
              "lib/link": {"type": "link", "target": "../x"}}}"#,
        )
        .unwrap();
        let t = java_tasks(&m, "jre-legacy");
        assert_eq!(t.len(), 1);
        assert!(t[0].executable);
        assert_eq!(t[0].path, std::path::Path::new("runtime/jre-legacy/bin/java"));
    }
}
