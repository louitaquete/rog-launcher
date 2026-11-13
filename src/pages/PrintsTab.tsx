import { useEffect, useState } from "react";
import { api, isTauri, shotsApi, type Instance, type Shot } from "../lib/api";
import { Modal } from "../components/ui";

/** Aba Prints: as screenshots da instância (F2 no jogo). */
export function PrintsTab({ instance }: { instance: Instance }) {
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [view, setView] = useState<Shot | null>(null);

  const load = () => shotsApi.list(instance.id).then(setShots).catch(() => setShots([]));
  useEffect(() => {
    load();
  }, [instance.id]);

  // Carrega as miniaturas aos poucos.
  useEffect(() => {
    if (!shots || !isTauri) return;
    let alive = true;
    (async () => {
      for (const s of shots) {
        if (!alive) return;
        if (urls[s.path]) continue;
        try {
          const u = await shotsApi.url(s.path);
          if (alive) setUrls((m) => ({ ...m, [s.path]: u }));
        } catch {
          /* ignora o print que não abriu */
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [shots]);

  async function remove(s: Shot) {
    await shotsApi.remove(instance.id, s.name);
    setView(null);
    load();
  }

  if (shots === null) return null;
  if (shots.length === 0)
    return (
      <div className="flex flex-col items-center gap-2 px-10 py-20 text-center">
        <p className="m-0 text-sm font-semibold text-ink">Nenhum print ainda</p>
        <p className="m-0 text-xs text-muted">Aperte F2 no jogo e eles aparecem aqui.</p>
      </div>
    );

  return (
    <div className="flex flex-col gap-4 px-10 py-6">
      <div className="flex items-center">
        <span className="flex-1 text-xs text-muted">{shots.length} {shots.length === 1 ? "print" : "prints"}</span>
        <button onClick={() => api.openFolder(instance.id)} className="px-3 py-1.5 text-xs text-muted hover:bg-raised hover:text-ink">Abrir pasta</button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {shots.map((s) => (
          <button key={s.path} onClick={() => setView(s)} className="group relative aspect-video overflow-hidden bg-surface">
            {urls[s.path] && <img src={urls[s.path]} alt="" className="h-full w-full object-cover brightness-90 transition-[transform,filter] duration-200 group-hover:scale-105 group-hover:brightness-100" />}
            <span className="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pt-5 pb-1.5 text-left text-xs text-[#cfcfcf] opacity-0 transition-opacity group-hover:opacity-100">
              {new Date(s.modified * 1000).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            </span>
          </button>
        ))}
      </div>

      {view && (
        <Modal
          title="Print"
          subtitle={new Date(view.modified * 1000).toLocaleString("pt-BR")}
          onClose={() => setView(null)}
          width={980}
          footer={
            <>
              <button onClick={() => remove(view)} className="px-3 py-2 text-sm text-danger hover:bg-danger hover:text-[#111112]">Apagar</button>
              <span className="flex-1" />
              <button onClick={() => shotsApi.open(instance.id, view.name, true)} className="px-4 py-2.5 text-sm text-soft hover:bg-raised">Mostrar na pasta</button>
              <button onClick={() => shotsApi.open(instance.id, view.name)} className="bg-ink px-4 py-2.5 text-sm font-semibold text-[#111112] hover:bg-white">Abrir</button>
            </>
          }
        >
          {urls[view.path] && <img src={urls[view.path]} alt="" className="block w-full" />}
        </Modal>
      )}
    </div>
  );
}
