import { useEffect, useState } from "react";
import { api, coverApi, extrasApi, installApi, loaderApi, type Instance, type LoaderVersion, type Overrides, type VersionInfo } from "../lib/api";
import { useApp } from "../lib/store";
import { Select, Toggle } from "../components/ui";
import { CommitInput, Group, Memory, Row } from "./SettingsPage";

/** Aba Configurações da instância (vale só para ela). */
export function InstanceSettingsTab({ instance }: { instance: Instance }) {
  const { refresh, settings } = useApp();
  const [inst, setInst] = useState(instance);
  const [cover, setCover] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const isPvp = inst.kind === "pvp";
  const hasLoader = !["Vanilla", "OptiFine"].includes(inst.loader.type);

  useEffect(() => {
    coverApi.url(inst.id).then(setCover);
    if (!isPvp) installApi.listVersions(false).then(setVersions).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!hasLoader || isPvp) return;
    loaderApi.versions(inst.loader.type, inst.mcVersion).then(setLoaderVersions).catch(() => setLoaderVersions([]));
  }, [inst.loader.type, inst.mcVersion, hasLoader, isPvp]);

  async function save(next: Instance) {
    setInst(next);
    setError(null);
    try {
      setInst(await api.updateInstance(next));
      refresh();
    } catch (e) {
      setError(String(e));
    }
  }
  const o = inst.overrides;
  const setO = (patch: Partial<Overrides>) => save({ ...inst, overrides: { ...o, ...patch } });
  const g = settings;

  return (
    <div className="flex flex-col gap-8 px-10 py-8">
      <div>
        <h2 className="m-0 text-lg font-semibold">Configurações da instância</h2>
        <p className="m-0 mt-1 text-sm text-muted">Valem só para {inst.name} e substituem as configurações globais</p>
        {error && <p className="m-0 mt-2 text-xs text-danger">{error}</p>}
      </div>

      {!isPvp && (
        <Group title="Identidade">
          <Row title="Nome" desc="Como a instância aparece no Início">
            <CommitInput value={inst.name} onCommit={(v) => v.trim() && save({ ...inst, name: v })} />
          </Row>
          <Row title="Capa" desc="Imagem quadrada, mínimo 256×256">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 border border-edge bg-raised bg-cover bg-center" style={cover ? { backgroundImage: `url(${cover})` } : undefined} />
              <button
                onClick={async () => {
                  const r = await coverApi.set(inst.id).catch((e) => (setError(String(e)), null));
                  if (r) {
                    setInst(r);
                    setCover(await coverApi.url(inst.id));
                    refresh();
                  }
                }}
                className="border border-edge px-3 py-2 text-sm text-soft hover:bg-raised"
              >
                Alterar imagem
              </button>
              {inst.cover && (
                <button
                  onClick={async () => {
                    const r = await coverApi.set(inst.id, true);
                    if (r) setInst(r);
                    setCover(null);
                    refresh();
                  }}
                  className="px-2 py-2 text-sm text-muted hover:text-ink"
                >
                  Remover
                </button>
              )}
            </div>
          </Row>
        </Group>
      )}

      {!isPvp && (
        <Group title="Versão">
          <Row title="Minecraft" desc="Trocar a versão baixa os arquivos de novo no próximo Jogar">
            <Select
              value={inst.mcVersion}
              onChange={(v) => save({ ...inst, mcVersion: v, launchVersion: null, loader: { ...inst.loader, version: null } })}
              options={(versions.some((v) => v.id === inst.mcVersion) ? versions : [{ id: inst.mcVersion, latest: false } as VersionInfo, ...versions]).map((v) => ({ value: v.id, label: v.id }))}
              className="w-[260px]"
            />
          </Row>
          {hasLoader && (
            <Row title={`Versão do ${inst.loader.type}`} desc="Recomendada = a mais recente estável">
              <Select
                value={inst.loader.version ?? ""}
                onChange={async (v) => {
                  const r = await extrasApi.changeLoader(inst.id, { type: inst.loader.type, version: v || null });
                  setInst(r);
                  refresh();
                }}
                options={[{ value: "", label: "Mais recente estável" }, ...loaderVersions.map((v) => ({ value: v.version, label: `${v.version}${v.recommended ? " (recomendada)" : v.stable ? "" : " · beta"}` }))]}
                className="w-[260px]"
              />
            </Row>
          )}
        </Group>
      )}

      <Group title="Java e memória">
        <Row title="Usar configurações globais" desc="Desligue para personalizar só esta instância">
          <Toggle on={inst.useGlobalSettings} onChange={(v) => save({ ...inst, useGlobalSettings: v })} />
        </Row>
        {!inst.useGlobalSettings && (
          <>
            <Row title="Memória alocada" desc="RAM máxima para esta instância">
              <Memory value={o.maxMemoryMb ?? g?.java.maxMemoryMb ?? 4096} onChange={(mb) => setO({ maxMemoryMb: mb })} />
            </Row>
            <Row title="Java" desc="Vazio = o Rog escolhe a versão certa sozinho">
              <CommitInput value={o.javaPath ?? ""} onCommit={(v) => setO({ javaPath: v.trim() || null })} className="w-[360px]" />
            </Row>
            <Row title="Argumentos JVM" desc="Somados aos argumentos globais">
              <CommitInput value={o.extraJvmArgs ?? ""} onCommit={(v) => setO({ extraJvmArgs: v.trim() || null })} className="w-[360px]" />
            </Row>
          </>
        )}
      </Group>

      <Group title="Opções de inicialização">
        <Row title="Tela cheia" desc="Abre o jogo direto em tela cheia">
          <Toggle on={o.fullscreen ?? g?.launch.fullscreen ?? false} onChange={(v) => setO({ fullscreen: v })} />
        </Row>
        <Row title="Resolução da janela" desc="Tamanho ao abrir em modo janela">
          <div className="flex items-center gap-2">
            <CommitInput type="number" value={String(o.width ?? g?.launch.width ?? 1280)} onCommit={(v) => setO({ width: Number(v) || null })} className="w-20" />
            <span className="text-muted">×</span>
            <CommitInput type="number" value={String(o.height ?? g?.launch.height ?? 720)} onCommit={(v) => setO({ height: Number(v) || null })} className="w-20" />
          </div>
        </Row>
        <Row title="Entrar em servidor ao iniciar" desc="Conecta direto num IP (opcional)">
          <CommitInput value={o.joinServer ?? ""} onCommit={(v) => setO({ joinServer: v.trim() || null })} className="w-[260px]" />
        </Row>
      </Group>
    </div>
  );
}
