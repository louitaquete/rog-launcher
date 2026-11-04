// Estado global simples: lista de instâncias e configurações, carregadas do disco.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type Instance, type Settings } from "./api";

interface AppState {
  instances: Instance[] | null;
  settings: Settings | null;
  refresh: () => Promise<void>;
  /** Atualiza as configurações na hora e salva no disco logo depois (com debounce). */
  updateSettings: (fn: (s: Settings) => Settings) => void;
  error: string | null;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [instances, setInstances] = useState<Instance[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

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

  return <Ctx.Provider value={{ instances, settings, refresh, updateSettings, error }}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp fora do AppProvider");
  return ctx;
}
