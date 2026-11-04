// Estado global simples: lista de instâncias e configurações, carregadas do disco.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, installApi, type Instance, type Progress, type Settings } from "./api";

interface AppState {
  instances: Instance[] | null;
  settings: Settings | null;
  refresh: () => Promise<void>;
  /** Atualiza as configurações na hora e salva no disco logo depois (com debounce). */
  updateSettings: (fn: (s: Settings) => Settings) => void;
  error: string | null;
  /** Progresso de cada instalação (fica guardado ao trocar de tela). */
  installs: Record<string, Progress>;
  startInstall: (id: string) => void;
  cancelInstall: (id: string) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [instances, setInstances] = useState<Instance[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [installs, setInstalls] = useState<Record<string, Progress>>({});

  const running = useRef(new Set<string>());

  const startInstall = useCallback((id: string) => {
    if (running.current.has(id)) return; // já está instalando
    running.current.add(id);
    const update = (p: Progress) => setInstalls((prev) => ({ ...prev, [id]: p }));
    update({ instanceId: id, stage: "java", filesDone: 0, filesTotal: 0, bytesPerSec: 0, current: "", error: null });
    installApi
      .install(id, update)
      .catch((e) => setInstalls((prev) => ({ ...prev, [id]: { ...prev[id], stage: "error", error: String(e) } })))
      .finally(() => running.current.delete(id));
  }, []);
  const cancelInstall = useCallback((id: string) => {
    installApi.cancel(id);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setInstances(await api.listInstances());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    api.getSettings().then(setSettings).catch((e) => setError(String(e)));
  }, [refresh]);

  const updateSettings = useCallback((fn: (s: Settings) => Settings) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        api.saveSettings(next).catch((e) => setError(String(e)));
      }, 400);
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ instances, settings, refresh, updateSettings, error, installs, startInstall, cancelInstall }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp fora do AppProvider");
  return ctx;
}
