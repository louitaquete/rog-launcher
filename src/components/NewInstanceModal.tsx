import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, installApi, type LoaderType, type VersionInfo } from "../lib/api";
import { useApp } from "../lib/store";
import { Button, Field, Modal, Segmented, Select, TextInput } from "./ui";

const LOADERS: LoaderType[] = ["Fabric", "Forge", "NeoForge", "Quilt"];

export function NewInstanceModal({ onClose, defaultKind = "vanilla" }: { onClose: () => void; defaultKind?: "vanilla" | "mods" }) {
  const { refresh } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"vanilla" | "mods">(defaultKind);
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [snapshots, setSnapshots] = useState(false);
  const [version, setVersion] = useState("");
  useEffect(() => {
    installApi
      .listVersions(snapshots)
      .then((v) => {
        setVersions(v);
        setVersion((cur) => (v.some((x) => x.id === cur) ? cur : (v.find((x) => x.latest) ?? v[0])?.id ?? ""));
      })
      .catch((e) => setError(String(e)));
  }, [snapshots]);
  const [loader, setLoader] = useState<LoaderType>("Fabric");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!version) return;
    setBusy(true);
    setError(null);
    try {
      const inst = await api.createInstance({
        name: name.trim() || (kind === "vanilla" ? `Vanilla ${version}` : `${loader} ${version}`),
        kind,
        mcVersion: version,
        loader: kind === "mods" ? { type: loader, version: null } : undefined,
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
      subtitle="Crie uma instância do zero"
      onClose={onClose}
      footer={
        <>
          <span className="flex-1 text-[11px] text-faint">{error ?? "Dá para mudar tudo depois nas configurações da instância"}</span>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={create} disabled={busy}>
            {busy ? "Criando…" : "Criar instância"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Nome">
          <TextInput autoFocus value={name} maxLength={64} placeholder={kind === "vanilla" ? `Vanilla ${version}` : `${loader} ${version}`} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        </Field>
        <Field label="Tipo" hint="Com mods instala um loader para você adicionar mods depois">
          <Segmented full value={kind} onChange={setKind} options={[{ value: "vanilla", label: "Vanilla" }, { value: "mods", label: "Com mods" }]} />
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
        {kind === "mods" && (
          <Field label="Loader" hint="A versão do loader é escolhida automaticamente (mais recente estável)">
            <Segmented full value={loader} onChange={setLoader} options={LOADERS.map((l) => ({ value: l, label: l }))} />
          </Field>
        )}
      </div>
    </Modal>
  );
}
