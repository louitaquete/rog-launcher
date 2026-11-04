import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type LoaderType } from "../lib/api";
import { useApp } from "../lib/store";
import { Button, Field, Modal, Segmented, Select, TextInput } from "./ui";

// Lista provisória: a próxima etapa troca por versões vindas do manifesto oficial da Mojang.
const VERSIONS = ["1.21.4", "1.21.1", "1.20.6", "1.20.4", "1.20.1", "1.19.4", "1.18.2", "1.16.5", "1.12.2", "1.8.9"];
const LOADERS: LoaderType[] = ["Fabric", "Forge", "NeoForge", "Quilt"];

export function NewInstanceModal({ onClose, defaultKind = "vanilla" }: { onClose: () => void; defaultKind?: "vanilla" | "mods" }) {
  const { refresh } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"vanilla" | "mods">(defaultKind);
  const [version, setVersion] = useState(VERSIONS[0]);
  const [loader, setLoader] = useState<LoaderType>("Fabric");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
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
          <Select value={version} onChange={setVersion} options={VERSIONS.map((v) => ({ value: v, label: v }))} className="w-64" />
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
