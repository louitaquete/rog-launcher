import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, coverApi, installApi, loaderApi, type LoaderType, type LoaderVersion, type VersionInfo } from "../lib/api";
import { useApp } from "../lib/store";
import { LoaderIcon } from "./LoaderIcon";
import { versionArt } from "./InstanceCover";
import { useDismiss } from "../lib/useDismiss";
import { ModpackSearch } from "./ModpackSearch";
import { Button, Modal, Select } from "./ui";

const LOADERS: LoaderType[] = ["Vanilla", "Fabric", "Forge", "NeoForge", "Quilt"];

export function NewInstanceModal({ onClose, defaultKind = "vanilla" }: { onClose: () => void; defaultKind?: "vanilla" | "mods" }) {
  const { refresh } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [snapshots, setSnapshots] = useState(false);
  const [version, setVersion] = useState("");
  const [loader, setLoader] = useState<LoaderType>(defaultKind === "mods" ? "Fabric" : "Vanilla");
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[] | null>(null);
  const [loaderVersion, setLoaderVersion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"scratch" | "modpacks">("scratch");
  const [image, setImage] = useState<{ path: string; url: string } | null>(null);
  const [imgMenu, setImgMenu] = useState(false);
  const imgRef = useDismiss<HTMLDivElement>(imgMenu, useCallback(() => setImgMenu(false), []));

  useEffect(() => {
    installApi
      .listVersions(snapshots)
      .then((v) => {
        setVersions(v);
        setVersion((cur) => (v.some((x) => x.id === cur) ? cur : (v.find((x) => x.latest) ?? v[0])?.id ?? ""));
      })
      .catch((e) => setError(String(e)));
  }, [snapshots]);

  // Versões do loader para a versão do Minecraft escolhida.
  useEffect(() => {
    if (loader === "Vanilla" || !version) {
      setLoaderVersions([]);
      return;
    }
    let live = true;
    setLoaderVersions(null);
    loaderApi
      .versions(loader, version)
      .then((list) => {
        if (!live) return;
        setLoaderVersions(list);
        setLoaderVersion((list.find((v) => v.recommended) ?? list[0])?.version ?? "");
      })
      .catch(() => live && setLoaderVersions([]));
    return () => {
      live = false;
    };
  }, [loader, version]);

  const isVanilla = loader === "Vanilla";
  const noLoader = !isVanilla && loaderVersions !== null && loaderVersions.length === 0;
  const placeholder = `${loader} ${version}`;
  const art = versionArt(version);

  async function create() {
    if (!version || noLoader || (!isVanilla && !loaderVersion)) return;
    setBusy(true);
    setError(null);
    try {
      const inst = await api.createInstance({
        name: name.trim() || placeholder,
        kind: isVanilla ? "vanilla" : "mods",
        mcVersion: version,
        loader: isVanilla ? undefined : { type: loader, version: loaderVersion },
      });
      if (image) await coverApi.setPath(inst.id, image.path).catch(() => {});
      await refresh();
      onClose();
      navigate(`/${inst.kind}/${inst.id}/jogar`);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  async function pickImage() {
    setImgMenu(false);
    try {
      const r = await coverApi.pick();
      if (r) setImage(r);
    } catch (e) {
      setError(String(e));
    }
  }

  const label = "m-0 mb-2 text-xs font-medium text-muted";
  const field = "flex h-11 w-full items-center bg-[#1a1a1a] px-3.5 text-sm text-ink";

  return (
    <Modal
      title="Nova instância"
      onClose={onClose}
      width={tab === "modpacks" ? 720 : 580}
      footer={
        tab === "modpacks" ? undefined : (
          <>
            <span className="flex-1 truncate text-[11px] text-[#e5484d]" title={error ?? ""}>{error ?? ""}</span>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" onClick={create} disabled={busy || noLoader || (!isVanilla && !loaderVersion)}>
              {busy ? "Criando…" : "Criar"}
            </Button>
          </>
        )
      }
    >
      <div className="-mt-1 mb-6 flex border-b border-line">
        {([
          ["scratch", "Do zero"],
          ["modpacks", "Modpacks"],
        ] as const).map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={`relative -mb-px px-4 py-2.5 text-[13px] font-medium ${tab === v ? "text-ink" : "text-muted hover:text-soft"}`}>
            {l}
            {tab === v && <span className="absolute right-0 bottom-0 left-0 h-0.5 bg-ink" />}
          </button>
        ))}
      </div>

      {tab === "modpacks" ? (
        <ModpackSearch
          onDone={async (inst) => {
            await refresh();
            onClose();
            navigate(`/${inst.kind}/${inst.id}/jogar`);
          }}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Imagem + nome */}
          <div className="flex gap-6">
            <div ref={imgRef} className="relative h-[112px] w-[112px] shrink-0">
              <button onClick={() => setImgMenu((m) => !m)} className="group relative h-full w-full overflow-hidden bg-[#1c1c1c]" title="Trocar imagem">
                {image ? (
                  <img src={image.url} alt="" className="h-full w-full object-cover" />
                ) : isVanilla && art ? (
                  <img src={art} alt="" className="h-full w-full object-cover brightness-75" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center grayscale">
                    <LoaderIcon loader={loader} size={52} />
                  </span>
                )}
                <span className="absolute top-2 left-2 flex h-8 w-8 items-center justify-center bg-[#0d0d0d]/85 text-ink group-hover:bg-[#0d0d0d]">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M11.5 1.5l3 3L5 14H2v-3z" /></svg>
                </span>
              </button>
              {imgMenu && (
                <div className="absolute top-12 left-2 z-10 w-48 bg-[#242424] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
                  <button onClick={pickImage} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] text-soft hover:bg-[#2e2e2e] hover:text-ink">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1.5" y="2.5" width="13" height="11" /><path d="M2 12l4-4 3 3 2-2 3 3" /></svg>
                    Escolher imagem
                  </button>
                  {image && (
                    <button onClick={() => { setImage(null); setImgMenu(false); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] text-soft hover:bg-[#2e2e2e] hover:text-ink">
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5 1h6v2h4v2H1V3h4zM2 6h12l-1 9H3z" /></svg>
                      Remover imagem
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <p className={label}>Nome</p>
              <div className={`${field} gap-2`}>
                <input
                  autoFocus
                  value={name}
                  maxLength={64}
                  placeholder={placeholder}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && create()}
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-[#6f6f6f]"
                />
                {name && (
                  <button onClick={() => setName("")} aria-label="Limpar" className="text-muted hover:text-ink">
                    <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" /></svg>
                  </button>
                )}
              </div>
              <p className="m-0 mt-2 text-[11px] text-[#7a7a7a]">Imagem opcional. Sem ela, usamos o banner da versão ou o símbolo do loader.</p>
            </div>
          </div>

          {/* Versão */}
          <div>
            <div className="mb-2 flex items-center">
              <p className={`${label} mb-0 flex-1`}>Versão do Minecraft</p>
              <label className="flex items-center gap-2 text-[11px] text-muted">
                <input type="checkbox" checked={snapshots} onChange={(e) => setSnapshots(e.target.checked)} className="accent-[#ededed]" />
                Mostrar snapshots
              </label>
            </div>
            <Select value={version} onChange={setVersion} options={versions.map((v) => ({ value: v.id, label: v.latest ? `${v.id} (mais recente)` : v.id }))} className="w-full" />
          </div>

          {/* Loader */}
          <div>
            <p className={label}>Loader</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {LOADERS.map((l) => {
                const on = l === loader;
                return (
                  <button key={l} type="button" onClick={() => setLoader(l)} className="flex items-center gap-2.5 py-1">
                    <span className={`flex h-[18px] w-[18px] items-center justify-center ${on ? "bg-ink" : "bg-[#2a2a2a]"}`}>{on && <span className="h-2 w-2 bg-[#111]" />}</span>
                    <span className={`text-[13px] ${on ? "font-semibold text-ink" : "text-soft"}`}>{l}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {!isVanilla && (
            <div>
              <p className={label}>Versão do {loader}</p>
              {loaderVersions === null ? (
                <div className={`${field} text-muted`}>Buscando versões…</div>
              ) : noLoader ? (
                <div className={`${field} text-[#9a9a9a]`}>O {loader} ainda não tem versão para o Minecraft {version}.</div>
              ) : (
                <Select
                  value={loaderVersion}
                  onChange={setLoaderVersion}
                  className="w-full"
                  options={loaderVersions.map((v) => ({ value: v.version, label: `${v.version}${v.recommended ? " (recomendada)" : v.stable ? "" : " · beta"}` }))}
                />
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
