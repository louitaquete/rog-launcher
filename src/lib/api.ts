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
  };
  java: { maxMemoryMb: number; minMemoryMb: number; javaPath: string | null; jvmArgs: string };
  launch: { skipMojangIntro: boolean; fullscreen: boolean; width: number; height: number };
  downloads: { concurrent: number; modSource: "modrinth" | "curseForge" | "both"; autoUpdateMods: boolean; speedLimitMbps: number };
  appearance: { uiScale: number; animations: boolean; reduceMotion: boolean; showPlayTime: boolean };
}

export const isTauri = "__TAURI_INTERNALS__" in window;

// ---------- Armazenamento falso para o navegador ----------
const DEFAULT_SETTINGS: Settings = {
  general: { language: "pt-BR", onLaunch: "minimize", startWithSystem: false, autoUpdate: true, killWarningDismissed: false },
  java: { maxMemoryMb: 6144, minMemoryMb: 2048, javaPath: null, jvmArgs: "-XX:+UseG1GC -XX:MaxGCPauseMillis=50" },
  launch: { skipMojangIntro: true, fullscreen: false, width: 1920, height: 1080 },
  downloads: { concurrent: 8, modSource: "modrinth", autoUpdateMods: false, speedLimitMbps: 0 },
  appearance: { uiScale: 100, animations: true, reduceMotion: false, showPlayTime: true },
};

const now = () => Math.floor(Date.now() / 1000);
const blank = (p: Pick<Instance, "id" | "name" | "kind" | "mcVersion" | "loader">): Instance => ({
  cover: null, createdAt: now(), lastPlayedAt: null, playTimeSecs: 0, useGlobalSettings: true, overrides: {}, skin: { enabled: false, skinId: null }, ...p,
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

export type Stage = "java" | "version" | "libraries" | "assets" | "done" | "cancelled" | "error";

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
  const plan: [Stage, number][] = [["java", 120], ["version", 2], ["libraries", 64], ["assets", 3400]];
  for (const [stage, total] of plan) {
    for (let done = 0; done <= total; done += Math.ceil(total / 25)) {
      if (simCancel[id]) return on({ instanceId: id, stage: "cancelled", filesDone: done, filesTotal: total, bytesPerSec: 0, current: "", error: null });
      on({ instanceId: id, stage, filesDone: Math.min(done, total), filesTotal: total, bytesPerSec: 12_400_000, current: `${stage}-${done}.bin`, error: null });
      await new Promise((r) => setTimeout(r, 60));
    }
  }
  on({ instanceId: id, stage: "done", filesDone: 0, filesTotal: 0, bytesPerSec: 0, current: "", error: null });
}
