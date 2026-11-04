//! Monta a linha de comando do Java a partir do arquivo da versão. Puro, sem processo nem rede.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::install::mojang::{maven_path, rules_allow, rules_allow_with, ArgValue, Argument, VersionJson};

/// Conta usada ao abrir o jogo.
#[derive(Debug, Clone)]
pub struct Account {
    pub name: String,
    /// UUID sem hífens.
    pub uuid: String,
    pub access_token: String,
    pub xuid: String,
    /// "msa" para contas Microsoft; "legacy" no modo offline de desenvolvimento.
    pub user_type: String,
}

impl Account {
    /// Conta offline com o mesmo UUID que o Minecraft gera para o nick (`OfflinePlayer:<nick>`).
    pub fn offline(name: &str) -> Self {
        use md5::{Digest, Md5};
        let mut h: [u8; 16] = Md5::digest(format!("OfflinePlayer:{name}").as_bytes()).into();
        h[6] = (h[6] & 0x0f) | 0x30;
        h[8] = (h[8] & 0x3f) | 0x80;
        Self { name: name.into(), uuid: hex::encode(h), access_token: "0".into(), xuid: "0".into(), user_type: "legacy".into() }
    }
}

/// Valores já resolvidos (globais + sobrescritas da instância).
#[derive(Debug, Clone)]
pub struct Options {
    pub max_memory_mb: u32,
    pub min_memory_mb: u32,
    pub jvm_args: Vec<String>,
    pub fullscreen: bool,
    pub width: u32,
    pub height: u32,
    pub join_server: Option<String>,
}

pub struct Paths<'a> {
    pub root: &'a Path,
    pub game_dir: &'a Path,
    pub natives_dir: &'a Path,
}

fn sep() -> &'static str {
    if cfg!(windows) { ";" } else { ":" }
}

/// Classpath: bibliotecas permitidas (sem os nativos no formato antigo) + jar do jogo.
pub fn classpath(version: &VersionJson, root: &Path, os: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for lib in &version.libraries {
        if !rules_allow(&lib.rules, os) {
            continue;
        }
        let path = lib
            .downloads
            .as_ref()
            .and_then(|d| d.artifact.as_ref())
            .and_then(|a| a.path.clone())
            .or_else(|| if lib.downloads.is_none() { maven_path(&lib.name, None) } else { None });
        if let Some(p) = path {
            let full = root.join("libraries").join(p);
            if !out.contains(&full) {
                out.push(full);
            }
        }
    }
    let jar = if version.jar_id.is_empty() { &version.id } else { &version.jar_id };
    out.push(root.join("versions").join(jar).join(format!("{jar}.jar")));
    out
}

/// Jars que trazem nativos (.dll/.so/.dylib) para extrair antes de abrir.
pub fn native_jars(version: &VersionJson, root: &Path, os: &str) -> Vec<PathBuf> {
    let arch_bits = if cfg!(target_pointer_width = "64") { "64" } else { "32" };
    let mut out = Vec::new();
    for lib in &version.libraries {
        if !rules_allow(&lib.rules, os) {
            continue;
        }
        let Some(dl) = &lib.downloads else { continue };
        if let Some(key) = lib.natives.get(os) {
            let key = key.replace("${arch}", arch_bits);
            if let Some(p) = dl.classifiers.get(&key).and_then(|a| a.path.clone()) {
                out.push(root.join("libraries").join(p));
            }
        }
        if lib.name.contains(":natives-")
            && let Some(p) = dl.artifact.as_ref().and_then(|a| a.path.clone())
        {
            out.push(root.join("libraries").join(p));
        }
    }
    out
}

fn substitute(arg: &str, vars: &HashMap<&str, String>) -> String {
    let mut out = arg.to_string();
    for (k, v) in vars {
        out = out.replace(&format!("${{{k}}}"), v);
    }
    out
}

fn expand(list: &[Argument], os: &str, feature: &dyn Fn(&str) -> bool, vars: &HashMap<&str, String>) -> Vec<String> {
    let mut out = Vec::new();
    for a in list {
        match a {
            Argument::Plain(s) => out.push(substitute(s, vars)),
            Argument::Ruled { rules, value } => {
                if rules_allow_with(rules, os, feature, false) {
                    match value {
                        ArgValue::One(s) => out.push(substitute(s, vars)),
                        ArgValue::Many(v) => out.extend(v.iter().map(|s| substitute(s, vars))),
                    }
                }
            }
        }
    }
    out
}

/// Todos os argumentos depois do executável do Java.
pub fn build(version: &VersionJson, paths: &Paths, account: &Account, opts: &Options, os: &str) -> Vec<String> {
    let cp: Vec<String> = classpath(version, paths.root, os).iter().map(|p| p.display().to_string()).collect();
    let assets = paths.root.join("assets");
    let mut vars: HashMap<&str, String> = HashMap::new();
    vars.insert("auth_player_name", account.name.clone());
    vars.insert("version_name", version.id.clone());
    vars.insert("game_directory", paths.game_dir.display().to_string());
    vars.insert("assets_root", assets.display().to_string());
    vars.insert("game_assets", assets.display().to_string());
    vars.insert("assets_index_name", version.asset_index.id.clone());
    vars.insert("auth_uuid", account.uuid.clone());
    vars.insert("auth_access_token", account.access_token.clone());
    vars.insert("auth_session", account.access_token.clone());
    vars.insert("auth_xuid", account.xuid.clone());
    vars.insert("clientid", String::new());
    vars.insert("user_type", account.user_type.clone());
    vars.insert("user_properties", "{}".into());
    vars.insert("version_type", if version.kind.is_empty() { "release".into() } else { version.kind.clone() });
    vars.insert("natives_directory", paths.natives_dir.display().to_string());
    vars.insert("launcher_name", "RogLauncher".into());
    vars.insert("launcher_version", env!("CARGO_PKG_VERSION").into());
    vars.insert("classpath", cp.join(sep()));
    vars.insert("classpath_separator", sep().into());
    vars.insert("library_directory", paths.root.join("libraries").display().to_string());
    vars.insert("resolution_width", opts.width.to_string());
    vars.insert("resolution_height", opts.height.to_string());

    let custom_res = !opts.fullscreen;
    let feature = move |name: &str| name == "has_custom_resolution" && custom_res;

    let mut args = vec![format!("-Xmx{}M", opts.max_memory_mb), format!("-Xms{}M", opts.min_memory_mb.min(opts.max_memory_mb))];
    args.extend(opts.jvm_args.iter().cloned());

    match &version.arguments {
        Some(a) if !a.jvm.is_empty() => args.extend(expand(&a.jvm, os, &feature, &vars)),
        _ => {
            // Versões antigas não trazem argumentos de JVM: usamos os mesmos do launcher oficial.
            args.push(format!("-Djava.library.path={}", paths.natives_dir.display()));
            args.push("-cp".into());
            args.push(cp.join(sep()));
        }
    }
    if let Some(log) = &version.logging {
        let file = assets.join("log_configs").join(&log.client.file.id);
        if !log.client.argument.is_empty() {
            args.push(log.client.argument.replace("${path}", &file.display().to_string()));
        }
    }

    args.push(version.main_class.clone());

    match (&version.arguments, &version.minecraft_arguments) {
        (Some(a), _) if !a.game.is_empty() => args.extend(expand(&a.game, os, &feature, &vars)),
        (_, Some(legacy)) => {
            args.extend(legacy.split_whitespace().map(|s| substitute(s, &vars)));
            if custom_res {
                args.extend(["--width".into(), opts.width.to_string(), "--height".into(), opts.height.to_string()]);
            }
        }
        _ => {}
    }
    if opts.fullscreen {
        args.push("--fullscreen".into());
    }
    if let Some(server) = opts.join_server.as_deref().filter(|s| !s.is_empty()) {
        let (host, port) = server.rsplit_once(':').unwrap_or((server, "25565"));
        args.extend(["--server".into(), host.into(), "--port".into(), port.into()]);
    }
    args
}

#[cfg(test)]
mod tests {
    use super::*;

    const MODERN: &str = r#"{
      "id": "1.21.4", "type": "release", "mainClass": "net.minecraft.client.main.Main",
      "assetIndex": {"id": "19", "sha1": "a", "size": 1, "url": "u"},
      "downloads": {"client": {"sha1": "c", "size": 1, "url": "u"}},
      "logging": {"client": {"argument": "-Dlog4j.configurationFile=${path}", "file": {"id": "client-1.21.2.xml", "sha1": "l", "size": 1, "url": "u"}}},
      "arguments": {
        "game": ["--username", "${auth_player_name}", "--version", "${version_name}", "--gameDir", "${game_directory}",
                 "--assetsDir", "${assets_root}", "--assetIndex", "${assets_index_name}", "--uuid", "${auth_uuid}",
                 "--accessToken", "${auth_access_token}", "--userType", "${user_type}",
                 {"rules": [{"action": "allow", "features": {"is_demo_user": true}}], "value": "--demo"},
                 {"rules": [{"action": "allow", "features": {"has_custom_resolution": true}}], "value": ["--width", "${resolution_width}", "--height", "${resolution_height}"]}],
        "jvm": [{"rules": [{"action": "allow", "os": {"name": "osx"}}], "value": ["-XstartOnFirstThread"]},
                "-Djava.library.path=${natives_directory}", "-cp", "${classpath}"]
      },
      "libraries": [
        {"name": "com.mojang:brigadier:1.0.18", "downloads": {"artifact": {"path": "com/mojang/brigadier/1.0.18/brigadier-1.0.18.jar", "sha1": "b", "size": 1, "url": "u"}}},
        {"name": "org.lwjgl:lwjgl:3.3.3:natives-windows", "rules": [{"action": "allow", "os": {"name": "windows"}}],
         "downloads": {"artifact": {"path": "org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar", "sha1": "w", "size": 1, "url": "u"}}}
      ]
    }"#;

    const LEGACY: &str = r#"{
      "id": "1.8.9", "type": "release", "mainClass": "net.minecraft.client.main.Main",
      "minecraftArguments": "--username ${auth_player_name} --version ${version_name} --gameDir ${game_directory} --assetsDir ${assets_root} --assetIndex ${assets_index_name} --uuid ${auth_uuid} --accessToken ${auth_access_token} --userProperties ${user_properties} --userType ${user_type}",
      "assetIndex": {"id": "1.8", "sha1": "a", "size": 1, "url": "u"},
      "downloads": {"client": {"sha1": "c", "size": 1, "url": "u"}},
      "libraries": [
        {"name": "org.lwjgl.lwjgl:lwjgl-platform:2.9.4", "natives": {"windows": "natives-windows", "linux": "natives-linux"},
         "downloads": {"classifiers": {"natives-windows": {"path": "org/lwjgl/lwjgl/lwjgl-platform/2.9.4/lwjgl-platform-2.9.4-natives-windows.jar", "sha1": "n", "size": 1, "url": "u"}}}},
        {"name": "com.google.guava:guava:17.0", "downloads": {"artifact": {"path": "com/google/guava/guava/17.0/guava-17.0.jar", "sha1": "g", "size": 1, "url": "u"}}}
      ]
    }"#;

    fn opts(fullscreen: bool) -> Options {
        Options { max_memory_mb: 4096, min_memory_mb: 1024, jvm_args: vec!["-XX:+UseG1GC".into()], fullscreen, width: 1280, height: 720, join_server: None }
    }

    fn run(json: &str, fullscreen: bool) -> Vec<String> {
        let v: VersionJson = serde_json::from_str(json).unwrap();
        let root = Path::new("/r");
        let paths = Paths { root, game_dir: Path::new("/r/instances/x/minecraft"), natives_dir: Path::new("/r/versions/v/natives") };
        build(&v, &paths, &Account::offline("Steve"), &opts(fullscreen), "windows")
    }

    #[test]
    fn offline_uuid_matches_minecraft() {
        // Valor conhecido do Minecraft para "Notch" em modo offline.
        assert_eq!(Account::offline("Notch").uuid, "b50ad385829d3141a2167e7d7539ba7f");
    }

    #[test]
    fn modern_arguments() {
        let a = run(MODERN, false);
        assert_eq!(&a[..3], ["-Xmx4096M", "-Xms1024M", "-XX:+UseG1GC"]);
        assert!(!a.contains(&"-XstartOnFirstThread".into()));
        assert!(a.contains(&"-Djava.library.path=/r/versions/v/natives".into()));
        let cp = &a[a.iter().position(|x| x == "-cp").unwrap() + 1];
        assert!(cp.contains("brigadier-1.0.18.jar") && cp.contains("lwjgl-3.3.3-natives-windows.jar") && cp.ends_with("1.21.4.jar"));
        assert!(a.iter().any(|x| x.starts_with("-Dlog4j.configurationFile=") && x.ends_with("client-1.21.2.xml")));
        let main = a.iter().position(|x| x == "net.minecraft.client.main.Main").unwrap();
        assert!(a.iter().position(|x| x == "-cp").unwrap() < main);
        assert!(a.contains(&"Steve".into()) && a.contains(&"--width".into()) && a.contains(&"720".into()));
        assert!(!a.contains(&"--demo".into()));
        assert!(!a.iter().any(|x| x.contains("${")));
    }

    #[test]
    fn fullscreen_drops_resolution() {
        let a = run(MODERN, true);
        assert!(!a.contains(&"--width".into()));
        assert_eq!(a.last().unwrap(), "--fullscreen");
    }

    #[test]
    fn legacy_arguments_and_natives() {
        let a = run(LEGACY, false);
        let cp = &a[a.iter().position(|x| x == "-cp").unwrap() + 1];
        assert!(cp.contains("guava-17.0.jar") && !cp.contains("natives-windows"));
        assert!(a.contains(&"1.8".into()) && a.contains(&"{}".into()) && a.contains(&"--height".into()));
        assert!(!a.iter().any(|x| x.contains("${")));
        let v: VersionJson = serde_json::from_str(LEGACY).unwrap();
        let n = native_jars(&v, Path::new("/r"), "windows");
        assert_eq!(n.len(), 1);
        assert!(n[0].ends_with("lwjgl-platform-2.9.4-natives-windows.jar"));
    }
}
