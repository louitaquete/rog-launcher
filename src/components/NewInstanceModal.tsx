import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, coverApi, installApi, loaderApi, type LoaderType, type LoaderVersion, type VersionInfo } from "../lib/api";
import { useApp } from "../lib/store";
import { LoaderIcon } from "./LoaderIcon";
import { versionArt } from "./InstanceCover";
import { useDismiss } from "../lib/useDismiss";
import { Button, Modal, Select } from "./ui";

const LOADERS: LoaderType[] = ["Fabric", "Forge", "NeoForge", "Quilt", "Vanilla"];

const cube = (cx: number, cy: number, s: number, t: string, l: string, r: string) => (
  <>
    <path d={`M${cx} ${cy - s}L${cx + s} ${cy - s / 2}L${cx} ${cy}L${cx - s} ${cy - s / 2}Z`} fill={t} />
    <path d={`M${cx - s} ${cy - s / 2}L${cx} ${cy}L${cx} ${cy + s}L${cx - s} ${cy + s / 2}Z`} fill={l} />
    <path d={`M${cx + s} ${cy - s / 2}L${cx} ${cy}L${cx} ${cy + s}L${cx + s} ${cy + s / 2}Z`} fill={r} />
  </>
);
const PackIcon = () => (
  <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
    {cube(38, 74, 22, "#b6b6bb", "#6a6a70", "#4a4a50")}
    {cube(82, 74, 22, "#b6b6bb", "#6a6a70", "#4a4a50")}
    {cube(60, 41, 22, "#f2f2f2", "#b6b6bb", "#86868c")}
  </svg>
);
const ZeroIcon = () => (
  <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
    <g stroke="#86868c" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="5 4">
      <path d="M56 28L86 43L56 58L26 43Z" />
      <path d="M26 43L26 73L56 88L86 73L86 43" />
      <path d="M56 58L56 88" />
    </g>
    <rect x="74" y="72" width="30" height="30" rx="7" fill="#f2f2f2" />
    <path d="M89 80v14M82 87h14" stroke="#111112" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);
const HINT: Partial<Record<LoaderType, string>> = { Fabric: "Leve e rápido", Forge: "O clássico", NeoForge: "Novo Forge", Quilt: "Alternativo", Vanilla: "Sem mods" };

function Choice({ title, text, tags, icon, primary, onClick }: { title: string; text: string; tags: string[]; icon: React.ReactNode; primary?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`group flex flex-col overflow-hidden !rounded-[10px] border-[1.5px] bg-raised text-left ${primary ? "border-ink" : "border-transparent hover:border-[#5a5a5f]"}`}>
      <span className="flex h-[170px] w-full items-center justify-center bg-bg transition-transform duration-200 group-hover:[&>svg]:scale-105 [&>svg]:transition-transform [&>svg]:duration-200">{icon}</span>
      <span className="flex flex-col gap-2 px-[18px] py-4">
        <span className="text-base font-semibold text-ink">{title}</span>
        <span className="text-sm leading-[22px] text-soft">{text}</span>
        <span className="flex gap-1.5 pt-1">{tags.map((t) => <span key={t} className="rounded-[6px] bg-active px-2 py-[3px] text-xs font-medium text-soft">{t}</span>)}</span>
      </span>
    </button>
  );
}

export function NewInstanceModal({ onClose, onImport, start = "choose" }: { onClose: () => void; onImport?: () => void; start?: "choose" | "scratch"; defaultKind?: "vanilla" | "mods" }) {
  const [step, setStep] = useState<"choose" | "scratch">(start);
  const { refresh } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [snapshots, setSnapshots] = useState(false);
  const [version, setVersion] = useState("");
  const [loader, setLoader] = useState<LoaderType>("Fabric");
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[] | null>(null);
  const [loaderVersion, setLoaderVersion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
      navigate(`/${inst.kind}/${inst.id}/conteudo`);
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

  const label = "m-0 mb-1.5 text-xs font-medium text-muted";
  const field = "flex h-11 w-full items-center rounded-[6px] bg-raised px-3.5 text-sm text-ink";

  const explore = () => {
    onClose();
    navigate("/mods/explorar");
  };

  if (step === "choose")
    return (
      <Modal
        title="Nova instância"
        subtitle="Como você quer começar?"
        onClose={onClose}
        width={748}
        footer={
          onImport && (
            <span className="text-xs text-muted">
              Já tem um arquivo ou vem de outro launcher?{" "}
              <button onClick={() => { onClose(); onImport(); }} className="p-0 font-medium text-ink hover:underline">Importar →</button>
            </span>
          )
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Choice primary title="Modpack pronto" text="Centenas de mods já configurados e testados juntos. Escolha um e jogue." tags={["Modrinth", "CurseForge"]} icon={<PackIcon />} onClick={explore} />
          <Choice title="Do zero" text="Você escolhe a versão e o loader, e adiciona os mods que quiser depois." tags={["Qualquer versão", "5 loaders"]} icon={<ZeroIcon />} onClick={() => setStep("scratch")} />
        </div>
      </Modal>
    );

  return (
    <Modal
      title="Nova instância"
      subtitle="Monte do zero em menos de um minuto"
      onClose={onClose}
      width={640}
      footer={
        <>
          {error ? (
            <span className="flex-1 truncate text-xs text-danger" title={error}>{error}</span>
          ) : (
            <span className="flex-1 text-xs text-muted">
              Prefere um pacote pronto?{" "}
              <button onClick={explore} className="p-0 font-medium text-ink hover:underline">Explorar modpacks →</button>
            </span>
          )}
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={create} disabled={busy || noLoader || (!isVanilla && !loaderVersion)}>
            {busy ? "Criando…" : "Criar instância"}
          </Button>
        </>
      }
    >
        <div className="flex flex-col gap-5">
          {/* Imagem + nome */}
          <div className="flex gap-[18px]">
            <div ref={imgRef} className="relative h-[104px] w-[104px] shrink-0">
              <button onClick={() => setImgMenu((m) => !m)} className="group relative h-full w-full overflow-hidden !rounded-[10px] bg-raised" title="Trocar imagem">
                {image ? (
                  <img src={image.url} alt="" className="h-full w-full object-cover" />
                ) : isVanilla && art ? (
                  <img src={art} alt="" className="h-full w-full object-cover brightness-75" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center grayscale">
                    <LoaderIcon loader={loader} size={52} />
                  </span>
                )}
                <span className="absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-[6px] bg-black/65 text-ink group-hover:bg-black/85">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M11.5 1.5l3 3L5 14H2v-3z" /></svg>
                </span>
              </button>
              {imgMenu && (
                <div className="absolute top-11 left-2 z-10 w-48 overflow-hidden rounded-[10px] bg-active py-1 shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
                  <button onClick={pickImage} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] text-soft !rounded-none hover:bg-[#34343a] hover:text-ink">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1.5" y="2.5" width="13" height="11" /><path d="M2 12l4-4 3 3 2-2 3 3" /></svg>
                    Escolher imagem
                  </button>
                  {image && (
                    <button onClick={() => { setImage(null); setImgMenu(false); }} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] text-soft !rounded-none hover:bg-[#34343a] hover:text-ink">
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
            <div className="grid grid-cols-5 gap-2">
              {LOADERS.map((l) => {
                const on = l === loader;
                return (
                  <button key={l} type="button" onClick={() => setLoader(l)} className={`flex flex-col gap-0.5 border-[1.5px] px-3 py-2.5 text-left ${on ? "border-ink bg-active" : "border-transparent bg-raised hover:bg-active"}`}>
                    <span className={`text-sm font-medium ${on ? "text-ink" : "text-soft"}`}>{l}</span>
                    <span className="text-xs text-muted">{HINT[l]}</span>
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
    </Modal>
  );
}
