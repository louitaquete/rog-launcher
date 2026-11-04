// Estado global: instâncias, configurações, downloads e jogos abertos.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, gameApi, installApi, type GameState, type Instance, type Progress, type Settings } from "./api";

const MAX_LOG_LINES = 3000;

interface AppState {
  instances: Instance[] | null;
  settings: Settings | null;
  refresh: () => Promise<void>;
  /** Atualiza as configurações na hora e salva no disco logo depois (com debounce). */
  updateSettings: (fn: (s: Settings) => Settings) => void;
  error: string | null;
  /** Progresso de cada download (fica guardado ao trocar de tela). */
  installs: Record<string, Progress>;
  cancelInstall: (id: string) => void;
  /** Baixa o que faltar e abre o jogo. */
  play: (id: string) => void;
  games: Record<string, GameState>;
  logs: Record<string, string[]>;
  /** Erro ao abrir (ex.: precisa de conta). */
  launchErrors: Record<string, string>;
  kill: (id: string) => void;
  devOffline: boolean;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [instances, setInstances] = useState<Instance[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [installs, setInstalls] = useState<Record<string, Progress>>({});
  const [games, setGames] = useState<Record<string, GameState>>({});
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [launchErrors, setLaunchErrors] = useState<Record<string, string>>({});
  const [devOffline, setDevOffline] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const busy = useRef(new Set<string>());

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
    gameApi.devOffline().then(setDevOffline);
    let stop: (() => void) | undefined;
    gameApi
      .listen(
        (l) => setLogs((m) => ({ ...m, [l.instanceId]: [...(m[l.instanceId] ?? []), l.line].slice(-MAX_LOG_LINES) })),
        (s) => {
          setGames((m) => ({ ...m, [s.instanceId]: s }));
          if (s.state === "running") setLogs((m) => ({ ...m, [s.instanceId]: [] }));
          if (s.state === "exited") refresh();
        },
      )
      .then((fn) => (stop = fn));
    return () => stop?.();
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

  const play = useCallback(
    (id: string) => {
      if (busy.current.has(id)) return; // já baixando ou jogando
      busy.current.add(id);
      setLaunchErrors(({ [id]: _, ...rest }) => rest);
      const last = { stage: "java" as Progress["stage"] };
      const update = (p: Progress) => {
        last.stage = p.stage;
        setInstalls((prev) => ({ ...prev, [id]: p }));
      };
      update({ instanceId: id, stage: "java", filesDone: 0, filesTotal: 0, bytesPerSec: 0, current: "", error: null });
      installApi
        .install(id, update)
        .then(() => {
          if (last.stage === "done") return gameApi.launch(id);
        })
        .catch((e) => {
          const msg = String(e);
          if (last.stage !== "done") {
            setInstalls((prev) => ({ ...prev, [id]: { ...prev[id], stage: "error", error: msg } }));
          } else {
            setLaunchErrors((m) => ({ ...m, [id]: msg }));
          }
        })
        .finally(() => busy.current.delete(id));
    },
    [],
  );

  const cancelInstall = useCallback((id: string) => {
    installApi.cancel(id);
  }, []);
  const kill = useCallback((id: string) => {
    gameApi.kill(id);
  }, []);

  return (
    <Ctx.Provider value={{ instances, settings, refresh, updateSettings, error, installs, cancelInstall, play, games, logs, launchErrors, kill, devOffline }}>
      {children}
    </Ctx.Provider>
  );
}


export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp fora do AppProvider");
  return ctx;
}
