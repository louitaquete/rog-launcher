import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, installApi, loaderApi, type LoaderType, type LoaderVersion, type VersionInfo } from "../lib/api";
import { useApp } from "../lib/store";
import { LoaderIcon } from "./LoaderIcon";
import { Button, Field, Modal, Select, TextInput } from "./ui";

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
      await refresh();
      onClose();
      navigate(`/${inst.kind}/${inst.id}/jogar`);
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Nova instância"
      onClose={onClose}
      footer={
        <>
          <span className="flex-1 text-[11px] text-faint">{error ?? ""}</span>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={create} disabled={busy || noLoader || (!isVanilla && !loaderVersion)}>
            {busy ? "Criando…" : "Criar instância"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <Field label="Nome">
          <TextInput autoFocus value={name} maxLength={64} placeholder={placeholder} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        </Field>

        <Field label="Versão do Minecraft">
          <div className="flex items-center gap-4">
            <Select value={version} onChange={setVersion} options={versions.map((v) => ({ value: v.id, label: v.latest ? `${v.id} (mais recente)` : v.id }))} className="w-64" />
            <label className="flex items-center gap-2 text-xs text-[#9a9a9a]">
              <input type="checkbox" checked={snapshots} onChange={(e) => setSnapshots(e.target.checked)} className="accent-[#ededed]" />
              Mostrar snapshots
            </label>
          </div>
        </Field>

        <Field label="Loader">
          <div className="grid grid-cols-5 gap-2">
            {LOADERS.map((l) => {
              const on = l === loader;
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLoader(l)}
                  className={`flex flex-col items-center gap-2.5 border px-2 pt-4 pb-3 ${on ? "border-ink bg-raised" : "border-edge bg-[#151515] hover:border-[#4a4a4a] hover:bg-[#1a1a1a]"}`}
                >
                  <span className={on ? "" : "opacity-60"}>
                    <LoaderIcon loader={l} size={40} />
                  </span>
                  <span className={`text-[13px] font-medium ${on ? "text-ink" : "text-[#9a9a9a]"}`}>{l}</span>
                </button>
              );
            })}
          </div>
        </Field>

        {!isVanilla && (
          <Field label={`Versão do ${loader}`}>
            {loaderVersions === null ? (
              <p className="m-0 flex h-10 items-center text-[13px] text-muted">Buscando versões…</p>
            ) : noLoader ? (
              <p className="m-0 flex h-10 items-center text-[13px] text-[#9a9a9a]">
                O {loader} ainda não tem versão para o Minecraft {version}.
              </p>
            ) : (
              <Select
                value={loaderVersion}
                onChange={setLoaderVersion}
                className="w-64"
                options={loaderVersions.map((v) => ({ value: v.version, label: `${v.version}${v.recommended ? " (recomendada)" : v.stable ? "" : " · beta"}` }))}
              />
            )}
          </Field>
        )}
      </div>
    </Modal>
  );
}
