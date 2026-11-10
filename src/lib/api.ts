// Ponte com o Rust. No navegador (npm run dev) usa um armazenamento falso em localStorage,
// para dar para mexer na interface sem abrir o app.
import { invoke } from "@tauri-apps/api/core";

export type Kind = "vanilla" | "mods" | "pvp";
export type LoaderType = "Vanilla" | "Fabric" | "Forge" | "NeoForge" | "Quilt" | "OptiFine";

export interface Loader {
  type: LoaderType;
  version: string | null;
}

export interface Overrides {
  maxMemoryMb?: number | null;
  javaPath?: string | null;
  extraJvmArgs?: string | null;
  skipMojangIntro?: boolean | null;
  fullscreen?: boolean | null;
  width?: number | null;
  height?: number | null;
  joinServer?: string | null;
}

export interface Instance {
  id: string;
  name: string;
  kind: Kind;
  mcVersion: string;
  loader: Loader;
  cover: string | null;
  createdAt: number;
  lastPlayedAt: number | null;
  playTimeSecs: number;
  useGlobalSettings: boolean;
  overrides: Overrides;
  skin: { enabled: boolean; skinId: string | null };
  launchVersion: string | null;
}

export interface NewInstance {
  name: string;
  kind: "vanilla" | "mods";
  mcVersion: string;
  loader?: Loader;
}

export interface Settings {
  general: {
    language: string;
    onLaunch: "minimize" | "keepOpen" | "close";
    startWithSystem: boolean;
    autoUpdate: boolean;
    killWarningDismissed: boolean;
    devNickname: string;
  };
  java: { maxMemoryMb: number; minMemoryMb: number; javaPath: string | null; jvmArgs: string };
  launch: { skipMojangIntro: boolean; fullscreen: boolean; width: number; height: number };
  downloads: { concurrent: number; modSource: "modrinth" | "curseForge" | "both"; autoUpdateMods: boolean; speedLimitMbps: number };
  appearance: { uiScale: number; animations: boolean; reduceMotion: boolean; showPlayTime: boolean };
}

export const isTauri = "__TAURI_INTERNALS__" in window;

// ---------- Armazenamento falso para o navegador ----------
const DEFAULT_SETTINGS: Settings = {
  general: { language: "pt-BR", onLaunch: "keepOpen", startWithSystem: false, autoUpdate: true, killWarningDismissed: false, devNickname: "Jogador" },
  java: { maxMemoryMb: 6144, minMemoryMb: 2048, javaPath: null, jvmArgs: "-XX:+UseG1GC -XX:MaxGCPauseMillis=50" },
  launch: { skipMojangIntro: true, fullscreen: false, width: 1920, height: 1080 },
  downloads: { concurrent: 8, modSource: "modrinth", autoUpdateMods: false, speedLimitMbps: 0 },
  appearance: { uiScale: 100, animations: true, reduceMotion: false, showPlayTime: true },
};

const now = () => Math.floor(Date.now() / 1000);
const blank = (p: Pick<Instance, "id" | "name" | "kind" | "mcVersion" | "loader">): Instance => ({
  cover: null, launchVersion: null, createdAt: now(), lastPlayedAt: null, playTimeSecs: 0, useGlobalSettings: true, overrides: {}, skin: { enabled: false, skinId: null }, ...p,
});

const mock = {
  read<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem("rog:" + key);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  write(key: string, v: unknown) {
    try {
      localStorage.setItem("rog:" + key, JSON.stringify(v));
    } catch {
      /* sem armazenamento: segue só em memória */
    }
  },
  instances(): Instance[] {
    const list = mock.read<Instance[]>("instances", []);
    if (!list.some((i) => i.id === "pvp")) {
      list.push(blank({ id: "pvp", name: "Minecraft PVP", kind: "pvp", mcVersion: "1.8.9", loader: { type: "OptiFine", version: null } }));
      mock.write("instances", list);
    }
    return list;
  },
};

function slugify(name: string) {
  const s = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (s || "instancia").slice(0, 48);
}

// ---------- API ----------
export const api = {
  dataDir: (): Promise<string> => (isTauri ? invoke("data_dir") : Promise.resolve("%APPDATA%\\.Rog (navegador: localStorage)")),
  appVersion: (): Promise<string> => (isTauri ? invoke("app_version") : Promise.resolve("dev")),

  getSettings: (): Promise<Settings> => (isTauri ? invoke("get_settings") : Promise.resolve(mock.read("settings", DEFAULT_SETTINGS))),
  saveSettings: (settings: Settings): Promise<Settings> => {
    if (isTauri) return invoke("save_settings", { settings });
    mock.write("settings", settings);
    return Promise.resolve(settings);
  },

  listInstances: (): Promise<Instance[]> => (isTauri ? invoke("list_instances") : Promise.resolve(mock.instances())),
  getInstance: (id: string): Promise<Instance> => {
    if (isTauri) return invoke("get_instance", { id });
    const inst = mock.instances().find((i) => i.id === id);
    return inst ? Promise.resolve(inst) : Promise.reject(`instância não encontrada: ${id}`);
  },
  createInstance: (instance: NewInstance): Promise<Instance> => {
    if (isTauri) return invoke("create_instance", { instance });
    const list = mock.instances();
    const name = instance.name.trim();
    if (!name) return Promise.reject("o nome precisa ter entre 1 e 64 caracteres");
    const base = slugify(name);
    let id = base;
    for (let n = 2; list.some((i) => i.id === id) || id === "pvp"; n++) id = `${base}-${n}`;
    const inst = blank({ id, name, kind: instance.kind, mcVersion: instance.mcVersion, loader: instance.kind === "vanilla" ? { type: "Vanilla", version: null } : instance.loader! });
    mock.write("instances", [...list, inst]);
    return Promise.resolve(inst);
  },
  updateInstance: (instance: Instance): Promise<Instance> => {
    if (isTauri) return invoke("update_instance", { instance });
    mock.write("instances", mock.instances().map((i) => (i.id === instance.id ? instance : i)));
    return Promise.resolve(instance);
  },
  deleteInstance: (id: string): Promise<void> => {
    if (isTauri) return invoke("delete_instance", { id });
    mock.write("instances", mock.instances().filter((i) => i.id !== id || id === "pvp"));
    return Promise.resolve();
  },
  openFolder: (id?: string): Promise<void> => (isTauri ? invoke("open_folder", { id: id ?? null }) : Promise.resolve()),
};

// ---------- Versões e instalação ----------
export interface VersionInfo {
  id: string;
  kind: string;
  latest: boolean;
}

export type Stage = "java" | "version" | "libraries" | "assets" | "loader" | "done" | "cancelled" | "error";

export interface Progress {
  instanceId: string;
  stage: Stage;
  filesDone: number;
  filesTotal: number;
  bytesPerSec: number;
  current: string;
  error: string | null;
}

const FALLBACK_VERSIONS = ["1.21.4", "1.21.1", "1.20.6", "1.20.4", "1.20.1", "1.19.4", "1.18.2", "1.16.5", "1.12.2", "1.8.9"];

export const installApi = {
  listVersions: (snapshots = false): Promise<VersionInfo[]> =>
    isTauri ? invoke("list_versions", { snapshots }) : Promise.resolve(FALLBACK_VERSIONS.map((id, i) => ({ id, kind: "release", latest: i === 0 }))),

  /** Instala e chama `onProgress` a cada atualização. Resolve quando termina (ou é cancelado). */
  install: async (id: string, onProgress: (p: Progress) => void): Promise<void> => {
    if (!isTauri) return simulateInstall(id, onProgress);
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen<Progress>("install-progress", (e) => e.payload.instanceId === id && onProgress(e.payload));
    try {
      await invoke("install_instance", { id });
    } finally {
      unlisten();
    }
  },
  cancel: (id: string): Promise<boolean> => (isTauri ? invoke("cancel_install", { id }) : Promise.resolve((simCancel[id] = true))),
};

// Simulação para o navegador, para dar para ver a tela de progresso.
const simCancel: Record<string, boolean> = {};
async function simulateInstall(id: string, on: (p: Progress) => void) {
  simCancel[id] = false;
  const inst = mock.instances().find((i) => i.id === id);
  const plan: [Stage, number][] = [["java", 120], ["version", 2], ["libraries", 64], ["assets", 3400]];
  if (inst && !["Vanilla", "OptiFine"].includes(inst.loader.type)) plan.push(["loader", 12]);
  for (const [stage, total] of plan) {
    for (let done = 0; done <= total; done += Math.ceil(total / 25)) {
      if (simCancel[id]) return on({ instanceId: id, stage: "cancelled", filesDone: done, filesTotal: total, bytesPerSec: 0, current: "", error: null });
      on({ instanceId: id, stage, filesDone: Math.min(done, total), filesTotal: total, bytesPerSec: 12_400_000, current: `${stage}-${done}.bin`, error: null });
      await new Promise((r) => setTimeout(r, 60));
    }
  }
  on({ instanceId: id, stage: "done", filesDone: 0, filesTotal: 0, bytesPerSec: 0, current: "", error: null });
}

// ---------- Jogo ----------
export interface GameState {
  instanceId: string;
  state: "running" | "exited";
  exitCode: number | null;
  killed: boolean;
  startedAt: number;
}

export interface LogLine {
  instanceId: string;
  line: string;
  stderr: boolean;
}

export const gameApi = {
  devOffline: (): Promise<boolean> => (isTauri ? invoke("dev_offline") : Promise.resolve(true)),
  /** Resolve quando o jogo fecha. */
  launch: (id: string): Promise<void> => (isTauri ? invoke("launch_instance", { id }) : simulateGame(id)),
  kill: (id: string): Promise<boolean> => (isTauri ? invoke("kill_game", { id }) : Promise.resolve((simKill[id] = true))),
  /** Assina os eventos do jogo; devolve a função para cancelar. */
  listen: async (onLog: (l: LogLine) => void, onState: (s: GameState) => void): Promise<() => void> => {
    if (!isTauri) {
      simHandlers = { onLog, onState };
      return () => (simHandlers = null);
    }
    const { listen } = await import("@tauri-apps/api/event");
    const a = await listen<LogLine>("game-log", (e) => onLog(e.payload));
    const b = await listen<GameState>("game-state", (e) => onState(e.payload));
    return () => {
      a();
      b();
    };
  },
};

// Simulação no navegador
const simKill: Record<string, boolean> = {};
let simHandlers: { onLog: (l: LogLine) => void; onState: (s: GameState) => void } | null = null;
async function simulateGame(id: string) {
  simKill[id] = false;
  const startedAt = Math.floor(Date.now() / 1000);
  simHandlers?.onState({ instanceId: id, state: "running", exitCode: null, killed: false, startedAt });
  const lines = ["[Render thread/INFO]: Setting user: Jogador", "[Render thread/INFO]: Backend library: LWJGL version 3.3.3", "[Render thread/WARN]: Missing sound for event: minecraft:item.goat_horn.play", "[Render thread/INFO]: Loaded 1373 recipes", "[Server thread/INFO]: Starting integrated minecraft server version 1.21.4"];
  for (let i = 0; i < 40 && !simKill[id]; i++) {
    simHandlers?.onLog({ instanceId: id, line: `[21:40:${String(i).padStart(2, "0")}] ${lines[i % lines.length]}`, stderr: false });
    await new Promise((r) => setTimeout(r, 150));
  }
  simHandlers?.onState({ instanceId: id, state: "exited", exitCode: simKill[id] ? -1 : 0, killed: !!simKill[id], startedAt });
}

// ---------- Conta Microsoft ----------
export interface Account {
  name: string;
  uuid: string;
}
export interface DeviceCode {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
}

export const accountApi = {
  get: (): Promise<Account | null> =>
    isTauri ? invoke("account_get") : Promise.resolve(JSON.parse(localStorage.getItem("rog.account") ?? "null")),
  /** Pede o código e abre microsoft.com/link. */
  start: (): Promise<DeviceCode> =>
    isTauri ? invoke("login_start") : Promise.resolve({ userCode: "AB12-CD34", verificationUri: "https://www.microsoft.com/link", expiresIn: 900 }),
  /** Resolve quando o usuário confirma o código. */
  wait: async (): Promise<Account> => {
    if (isTauri) return invoke("login_wait");
    await new Promise((r) => setTimeout(r, 2500));
    const a = { name: "Jogador", uuid: "b50ad385829d3141a2167e7d7539ba7f" };
    localStorage.setItem("rog.account", JSON.stringify(a));
    return a;
  },
  cancel: (): Promise<void> => (isTauri ? invoke("login_cancel") : Promise.resolve()),
  logout: (): Promise<void> => (isTauri ? invoke("logout") : Promise.resolve(localStorage.removeItem("rog.account"))),
};

// ---------- Conteúdo (mods, resource packs, shaders) ----------
export type ContentKind = "mod" | "resourcepack" | "shader";

export interface ContentMeta {
  kind: ContentKind;
  file: string;
  source: string;
  projectId: string;
  versionId: string;
  versionNumber: string;
  title: string;
  iconUrl: string | null;
}

export interface ContentItem {
  kind: ContentKind;
  file: string;
  enabled: boolean;
  size: number;
  meta: ContentMeta | null;
}

const simContent = (id: string): ContentItem[] => JSON.parse(localStorage.getItem(`rog.content.${id}`) ?? "[]");
const saveSim = (id: string, l: ContentItem[]) => localStorage.setItem(`rog.content.${id}`, JSON.stringify(l));

export const contentApi = {
  list: (id: string): Promise<ContentItem[]> => (isTauri ? invoke("content_list", { id }) : Promise.resolve(simContent(id))),
  install: async (id: string, req: { url: string; sha1: string | null; meta: ContentMeta }): Promise<void> => {
    if (isTauri) return invoke("content_install", { id, req });
    await new Promise((r) => setTimeout(r, 700));
    const l = simContent(id).filter((i) => i.meta?.projectId !== req.meta.projectId);
    l.push({ kind: req.meta.kind, file: req.meta.file, enabled: true, size: 1_200_000, meta: req.meta });
    saveSim(id, l);
  },
  remove: (id: string, kind: ContentKind, file: string): Promise<void> =>
    isTauri ? invoke("content_remove", { id, kind, file }) : Promise.resolve(saveSim(id, simContent(id).filter((i) => i.file !== file))),
  toggle: (id: string, kind: ContentKind, file: string, enabled: boolean): Promise<void> =>
    isTauri
      ? invoke("content_toggle", { id, kind, file, enabled })
      : Promise.resolve(saveSim(id, simContent(id).map((i) => (i.file === file ? { ...i, enabled } : i)))),
};

// ---------- CurseForge ----------
export const cfApi = {
  available: (): Promise<boolean> => (isTauri ? invoke("cf_available") : Promise.resolve(true)),
  search: (kind: ContentKind, mc: string, loader: string, query: string, sort: string, offset: number) =>
    isTauri
      ? invoke<{ hits: (import("./modrinth").Hit & { url: string | null })[]; total_hits: number }>("cf_search", { kind, mc, loader, query, sort, offset })
      : Promise.reject("CurseForge só funciona no app"),
  install: (id: string, kind: ContentKind, projectId: number): Promise<string[]> =>
    isTauri ? invoke("cf_install", { id, kind, projectId }) : Promise.reject("CurseForge só funciona no app"),
};

export async function openUrl(url: string) {
  if (!isTauri) return void window.open(url, "_blank");
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

// ---------- Versões de loader ----------
export interface LoaderVersion {
  version: string;
  stable: boolean;
  recommended: boolean;
}

export const loaderApi = {
  versions: async (loader: LoaderType, mc: string): Promise<LoaderVersion[]> => {
    if (isTauri) return invoke("loader_versions", { loader, mc });
    await new Promise((r) => setTimeout(r, 300));
    if (loader === "Vanilla" || loader === "OptiFine") return [];
    const base = { Fabric: "0.16.", Quilt: "0.27.", Forge: "52.0.", NeoForge: "21.4." }[loader];
    return Array.from({ length: 8 }, (_, i) => ({ version: `${base}${14 - i}`, stable: i !== 0, recommended: i === 1 }));
  },
};

// ---------- Instância: loader, exportar, importar; atualização ----------
export const extrasApi = {
  changeLoader: (id: string, loader: Loader): Promise<Instance> => {
    if (isTauri) return invoke("change_loader", { id, loader });
    const list = mock.instances();
    const i = list.findIndex((x) => x.id === id);
    list[i] = { ...list[i], loader, kind: loader.type === "Vanilla" ? "vanilla" : "mods", launchVersion: null };
    mock.write("instances", list);
    return Promise.resolve(list[i]);
  },
  exportInstance: (id: string): Promise<string> => (isTauri ? invoke("export_instance", { id }) : Promise.resolve(`Downloads/${id}.rog.zip`)),
  /** Pede o arquivo e importa. `null` se o usuário cancelar. */
  importInstance: async (): Promise<Instance | null> => {
    if (!isTauri) return Promise.reject("Importar só funciona no app");
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, directory: false, filters: [{ name: "Instância do Rog", extensions: ["zip"] }] });
    if (!path) return null;
    return invoke("import_instance", { path });
  },
  checkUpdate: (): Promise<{ version: string; url: string; download: string | null } | null> =>
    isTauri ? invoke("check_update") : Promise.resolve(null),
  applyUpdate: (url: string): Promise<void> => invoke("apply_update", { url }),
  releaseNotes: (): Promise<{ version: string; name: string; date: string; body: string; url: string; newer: boolean }[]> =>
    isTauri
      ? invoke("release_notes")
      : Promise.resolve([
          { version: "0.1.5-prealpha", name: "Rog Launcher v0.1.5-prealpha", date: "2026-11-07T15:00:00Z", body: "- Janelas não piscam mais ao excluir\n- Skin slim detectada sozinha", url: "#", newer: true },
          { version: "0.1.4-prealpha", name: "Rog Launcher v0.1.4-prealpha", date: "2026-11-07T14:00:00Z", body: "- Menus fecham ao clicar fora\n- Caixa de novidades", url: "#", newer: false },
        ]),
  deleteInstance: (id: string): Promise<void> => api.deleteInstance(id),
};

// ---------- Skins ----------
export type SkinVariant = "classic" | "slim";
export interface Skin {
  id: string;
  name: string;
  variant: SkinVariant;
}
export interface SkinLibrary {
  skins: Skin[];
  global: string | null;
}

const simSkins = (): SkinLibrary => JSON.parse(localStorage.getItem("rog.skins") ?? '{"skins":[],"global":null}');

async function pickFile(name: string, extensions: string[]): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const p = await open({ multiple: false, directory: false, filters: [{ name, extensions }] });
  return typeof p === "string" ? p : null;
}

export interface Cape {
  id: string;
  alias: string;
  active: boolean;
  url: string | null;
}

export const skinsApi = {
  capes: async (): Promise<Cape[]> => {
    if (!isTauri) return [];
    const list = await invoke<{ id: string; alias: string; active: boolean; png: number[] }[]>("account_capes");
    return list.map((c) => ({ id: c.id, alias: c.alias, active: c.active, url: c.png.length ? URL.createObjectURL(new Blob([new Uint8Array(c.png)], { type: "image/png" })) : null }));
  },
  setCape: (id: string | null): Promise<void> => (isTauri ? invoke("set_cape", { id }) : Promise.resolve()),
  /** Troca a skin da conta agora. `null` = volta para a skin da conta. */
  /** Skin global: vira a skin da conta; a anterior vai para a biblioteca. */
  setAccountSkin: (id: string): Promise<void> => (isTauri ? invoke("set_account_skin", { id }) : new Promise((r) => setTimeout(r, 600))),
  applyNow: (id: string | null): Promise<void> => (isTauri ? invoke("apply_skin_now", { id }) : new Promise((r) => setTimeout(r, 600))),
  /** Skin da conta Microsoft (minecraft.net) como URL de objeto. */
  account: async (): Promise<{ url: string; variant: SkinVariant } | null> => {
    if (!isTauri) return null;
    const r = await invoke<{ png: number[]; variant: SkinVariant } | null>("account_skin");
    return r ? { url: URL.createObjectURL(new Blob([new Uint8Array(r.png)], { type: "image/png" })), variant: r.variant } : null;
  },
  list: (): Promise<SkinLibrary> => (isTauri ? invoke("skins_list") : Promise.resolve(simSkins())),
  /** PNG da skin como URL de objeto (null no navegador). */
  url: async (id: string): Promise<string | null> => {
    if (!isTauri) return null;
    const bytes = await invoke<number[]>("skin_png", { id });
    return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
  },
  /** Pede um .png e adiciona à biblioteca. */
  add: async (variant: SkinVariant): Promise<Skin | null> => {
    if (!isTauri) {
      const lib = simSkins();
      const s = { id: String(Date.now()), name: `Skin ${lib.skins.length + 1}`, variant };
      lib.skins.push(s);
      localStorage.setItem("rog.skins", JSON.stringify(lib));
      return s;
    }
    const path = await pickFile("Skin do Minecraft", ["png"]);
    if (!path) return null;
    const name = path.split(/[\\/]/).pop()!.replace(/\.png$/i, "");
    return invoke("skin_add", { path, name, variant });
  },
  update: (skin: Skin): Promise<void> => {
    if (isTauri) return invoke("skin_update", { skin });
    const lib = simSkins();
    lib.skins = lib.skins.map((s) => (s.id === skin.id ? skin : s));
    localStorage.setItem("rog.skins", JSON.stringify(lib));
    return Promise.resolve();
  },
  remove: (id: string): Promise<void> => {
    if (isTauri) return invoke("skin_remove", { id });
    const lib = simSkins();
    lib.skins = lib.skins.filter((s) => s.id !== id);
    if (lib.global === id) lib.global = null;
    localStorage.setItem("rog.skins", JSON.stringify(lib));
    return Promise.resolve();
  },
  setGlobal: (id: string | null): Promise<void> => {
    if (isTauri) return invoke("skin_set_global", { id });
    localStorage.setItem("rog.skins", JSON.stringify({ ...simSkins(), global: id }));
    return Promise.resolve();
  },
};

// ---------- Capa da instância ----------
export const coverApi = {
  url: async (id: string): Promise<string | null> => {
    if (!isTauri) return null;
    const bytes = await invoke<number[] | null>("instance_cover", { id });
    return bytes ? URL.createObjectURL(new Blob([new Uint8Array(bytes)])) : null;
  },
  /** Pede uma imagem (ou remove com `remove = true`). */
  /** Escolhe uma imagem e devolve o caminho e uma prévia. */
  pick: async (): Promise<{ path: string; url: string } | null> => {
    if (!isTauri) return null;
    const path = await pickFile("Imagem", ["png", "jpg", "jpeg", "webp"]);
    if (!path) return null;
    const bytes = await invoke<number[]>("read_image", { path });
    return { path, url: URL.createObjectURL(new Blob([new Uint8Array(bytes)])) };
  },
  setPath: (id: string, path: string): Promise<Instance> => invoke("set_instance_cover_path", { id, path }),
  set: async (id: string, remove = false): Promise<Instance | null> => {
    if (!isTauri) return null;
    const path = remove ? null : await pickFile("Imagem", ["png", "jpg", "jpeg", "webp"]);
    if (!remove && !path) return null;
    return invoke("set_instance_cover", { id, path });
  },
};

// ---------- Importar ----------
export interface FoundInstance {
  launcher: string;
  name: string;
  path: string;
  mcVersion: string;
  loader: LoaderType;
  loaderVersion: string | null;
}
export interface LauncherScan {
  launcher: string;
  found: boolean;
  instances: FoundInstance[];
}

export const importApi = {
  pickAndImport: async (): Promise<Instance | null> => {
    if (!isTauri) return Promise.reject("Importar só funciona no app");
    const path = await pickFile("Instância ou modpack", ["zip", "mrpack"]);
    return path ? invoke("import_file", { path }) : null;
  },
  file: (path: string): Promise<Instance> => invoke("import_file", { path }),
  url: (url: string, cover?: string | null): Promise<Instance> => invoke("import_url", { url, cover: cover ?? null }),
  scan: (): Promise<LauncherScan[]> =>
    isTauri
      ? invoke("scan_launchers")
      : Promise.resolve([
          { launcher: "Prism Launcher", found: true, instances: [{ launcher: "Prism Launcher", name: "Create Above", path: "x", mcVersion: "1.20.1", loader: "Forge", loaderVersion: "47.2.0" }] },
          { launcher: "CurseForge", found: false, instances: [] },
          { launcher: "MultiMC", found: false, instances: [] },
        ]),
  found: (found: FoundInstance): Promise<Instance> => invoke("import_found", { found }),
};

export const cfModpackApi = {
  search: (query: string, offset: number) =>
    isTauri
      ? invoke<{ hits: (import("./modrinth").Hit & { url: string | null })[]; total_hits: number }>("cf_search_modpacks", { query, offset })
      : Promise.reject("CurseForge só funciona no app"),
  install: (projectId: number, cover?: string | null): Promise<Instance> => invoke("cf_import_modpack", { projectId, cover: cover ?? null }),
};

export interface Shot { path: string; name: string; modified: number }
export const shotsApi = {
  list: (id: string): Promise<Shot[]> => (isTauri ? invoke("screenshots", { id }) : Promise.resolve([])),
  url: async (path: string): Promise<string> => URL.createObjectURL(new Blob([new Uint8Array(await invoke<number[]>("read_image", { path }))], { type: "image/png" })),
  open: (id: string, name: string, reveal = false): Promise<void> => invoke("screenshot_open", { id, name, reveal }),
  remove: (id: string, name: string): Promise<void> => invoke("screenshot_delete", { id, name }),
};
