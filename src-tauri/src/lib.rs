mod install;
mod store;

use store::instances::{Instance, NewInstance};
use store::settings::Settings;
use store::Store;
use tauri::{Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

/// Erros chegam ao front como texto simples.
type Res<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[tauri::command]
fn data_dir(store: State<Store>) -> String {
    store.root().display().to_string()
}

#[tauri::command]
fn get_settings(store: State<Store>) -> Res<Settings> {
    store.load_settings().map_err(err)
}

#[tauri::command]
fn save_settings(store: State<Store>, settings: Settings) -> Res<Settings> {
    store.save_settings(settings).map_err(err)
}

#[tauri::command]
fn list_instances(store: State<Store>) -> Res<Vec<Instance>> {
    store.list_instances().map_err(err)
}

#[tauri::command]
fn get_instance(store: State<Store>, id: String) -> Res<Instance> {
    store.get_instance(&id).map_err(err)
}

#[tauri::command]
fn create_instance(store: State<Store>, instance: NewInstance) -> Res<Instance> {
    store.create_instance(instance).map_err(err)
}

#[tauri::command]
fn update_instance(store: State<Store>, instance: Instance) -> Res<Instance> {
    store.update_instance(instance).map_err(err)
}

#[tauri::command]
fn delete_instance(store: State<Store>, id: String) -> Res<()> {
    store.delete_instance(&id).map_err(err)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct VersionInfo {
    id: String,
    kind: String,
    latest: bool,
}

/// Versões oficiais: releases, e snapshots só se pedido.
#[tauri::command]
async fn list_versions(store: State<'_, Store>, snapshots: bool) -> Res<Vec<VersionInfo>> {
    let m = install::version_manifest(store.root()).await?;
    Ok(m.versions
        .into_iter()
        .filter(|v| v.kind == "release" || (snapshots && v.kind == "snapshot"))
        .map(|v| VersionInfo { latest: v.id == m.latest.release, id: v.id, kind: v.kind })
        .collect())
}

/// Baixa (ou confere) todos os arquivos do jogo da instância. O progresso chega pelo evento `install-progress`.
#[tauri::command]
async fn install_instance(app: tauri::AppHandle, store: State<'_, Store>, installs: State<'_, install::Installs>, id: String) -> Res<()> {
    let inst = store.get_instance(&id).map_err(err)?;
    let concurrency = store.load_settings().map(|s| s.downloads.concurrent as usize).unwrap_or(8);
    let cancel = installs.start(&id).ok_or("essa instância já está sendo instalada")?;
    let job = install::Job { root: store.root().to_path_buf(), instance_id: id.clone(), mc_version: inst.mc_version, concurrency, cancel };
    let emitter = app.clone();
    let result = install::install(job, move |p| {
        let _ = emitter.emit("install-progress", p);
    })
    .await;
    installs.finish(&id);
    result
}

#[tauri::command]
fn cancel_install(installs: State<install::Installs>, id: String) -> bool {
    installs.cancel(&id)
}

/// Abre no Explorer a pasta do launcher (`id` vazio) ou a pasta do jogo de uma instância.
#[tauri::command]
fn open_folder(app: tauri::AppHandle, store: State<Store>, id: Option<String>) -> Res<()> {
    let path = match id {
        Some(id) => store.game_dir(&id).map_err(err)?,
        None => store.root().to_path_buf(),
    };
    std::fs::create_dir_all(&path).map_err(err)?;
    app.opener().open_path(path.display().to_string(), None::<&str>).map_err(err)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let store = Store::default_location()?;
            store.load_settings()?;
            store.ensure_pvp()?;
            app.manage(store);
            app.manage(install::Installs::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_version,
            data_dir,
            get_settings,
            save_settings,
            list_instances,
            get_instance,
            create_instance,
            update_instance,
            delete_instance,
            open_folder,
            list_versions,
            install_instance,
            cancel_install,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Rog Launcher");
}
