import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { importApi, type FoundInstance, type Instance, type LauncherScan } from "../lib/api";
import { useApp } from "../lib/store";
import { Button, Modal } from "./ui";

/** Importar: arquivo (.rog.zip, .mrpack, .zip do CurseForge), link do Modrinth ou outros launchers do PC. */
export function ImportModal({ onClose }: { onClose: () => void }) {
  const { refresh } = useApp();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [scan, setScan] = useState<LauncherScan[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    importApi.scan().then(setScan).catch(() => setScan([]));
  }, []);

  async function run(label: string, fn: () => Promise<Instance | null>) {
    setBusy(label);
    setError(null);
    try {
      const inst = await fn();
      if (!inst) return setBusy(null);
      await refresh();
      onClose();
      navigate(`/${inst.kind}/${inst.id}/jogar`);
    } catch (e) {
      setError(String(e));
      setBusy(null);
      refresh();
    }
  }

  /** modrinth.com/modpack/<slug> → .mrpack da versão mais recente. */
  async function fromLink() {
    const m = link.trim().match(/modrinth\.com\/modpack\/([\w.-]+)/);
    if (!m) return setError("Cole um link de modpack do Modrinth, tipo https://modrinth.com/modpack/fabulously-optimized");
    await run("Baixando o modpack…", async () => {
      const r = await fetch(`https://api.modrinth.com/v2/project/${m[1]}/version`);
      if (!r.ok) throw new Error("modpack não encontrado no Modrinth");
      const versions: { version_type: string; files: { url: string; primary: boolean }[] }[] = await r.json();
      const v = versions.find((x) => x.version_type === "release") ?? versions[0];
      const file = v?.files.find((f) => f.primary) ?? v?.files[0];
      if (!file) throw new Error("esse modpack não tem arquivo para baixar");
      const p = await fetch(`https://api.modrinth.com/v2/project/${m[1]}`).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      const cover = p?.gallery?.find((g: { featured: boolean }) => g.featured)?.url ?? p?.icon_url ?? null;
      return importApi.url(file.url, cover);
    });
  }

  return (
    <Modal title="Importar instância" subtitle="Traga instâncias de arquivos ou de outros launchers" onClose={onClose} width={680}>
      <div className="flex flex-col gap-6 text-left">
        <div className="flex flex-col items-center gap-3 border border-dashed border-edge bg-[#141414] px-6 py-7">
          <p className="m-0 text-sm font-medium">Escolha um arquivo</p>
          <div className="flex gap-2 text-[11px] text-muted">
            <span className="border border-edge px-2 py-0.5">.mrpack Modrinth</span>
            <span className="border border-edge px-2 py-0.5">.zip CurseForge</span>
            <span className="border border-edge px-2 py-0.5">.rog.zip Rog</span>
          </div>
          <Button variant="primary" disabled={!!busy} onClick={() => run("Importando…", importApi.pickAndImport)}>
            Escolher arquivo
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          <p className="m-0 text-[11px] font-medium tracking-[0.08em] text-[#8a8a8a] uppercase">Ou cole um link</p>
          <div className="flex gap-2">
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fromLink()}
              placeholder="https://modrinth.com/modpack/..."
              className="h-10 flex-1 border border-edge bg-[#141414] px-3 text-[13px] text-ink outline-none placeholder:text-[#6f6f6f] focus:border-[#5a5a5a]"
            />
            <Button variant="outline" disabled={!!busy || !link.trim()} onClick={fromLink}>
              Buscar
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="m-0 text-[11px] font-medium tracking-[0.08em] text-[#8a8a8a] uppercase">De outros launchers neste PC</p>
          <div className="flex flex-col border border-line">
            {scan === null && <p className="m-0 px-4 py-3 text-[13px] text-muted">Procurando…</p>}
            {scan?.map((l) => (
              <div key={l.launcher} className="border-b border-line last:border-b-0">
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-8 w-8 items-center justify-center border border-edge bg-raised font-brand text-xs font-black text-[#9a9a9a]">{l.launcher[0]}</span>
                  <div className="flex-1">
                    <p className="m-0 text-[13px] font-semibold">{l.launcher}</p>
                    <p className="m-0 text-xs text-muted">{!l.found ? "Não encontrado" : `${l.instances.length} instância${l.instances.length === 1 ? "" : "s"} encontrada${l.instances.length === 1 ? "" : "s"}`}</p>
                  </div>
                  {l.instances.length > 0 && (
                    <button onClick={() => setOpen(open === l.launcher ? null : l.launcher)} className="border border-edge px-3 py-1.5 text-xs text-[#d0d0d0] hover:bg-raised">
                      {open === l.launcher ? "Fechar" : "Ver instâncias"}
                    </button>
                  )}
                </div>
                {open === l.launcher &&
                  l.instances.map((f: FoundInstance) => (
                    <div key={f.path} className="flex items-center gap-3 border-t border-line bg-[#121212] py-2.5 pr-4 pl-15">
                      <div className="min-w-0 flex-1">
                        <p className="m-0 truncate text-[13px]">{f.name}</p>
                        <p className="m-0 text-[11px] text-muted">
                          {f.mcVersion} · {f.loader}
                          {f.loaderVersion ? ` ${f.loaderVersion}` : ""}
                        </p>
                      </div>
                      <button disabled={!!busy} onClick={() => run(`Copiando ${f.name}…`, () => importApi.found(f))} className="bg-ink px-3 py-1.5 text-xs font-semibold text-[#111] hover:bg-white disabled:opacity-40">
                        Importar
                      </button>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>

        <p className="m-0 text-xs text-muted">{busy ?? error ?? "Mods de modpacks são baixados das fontes oficiais. Os mundos e configs vêm junto."}</p>
      </div>
    </Modal>
  );
}
