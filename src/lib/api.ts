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
