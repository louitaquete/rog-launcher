import { useEffect, useRef, useState } from "react";
import { SkinViewer, WalkingAnimation } from "skinview3d";
import { skinsApi, type Cape, type Skin, type SkinVariant } from "../lib/api";
import { useApp } from "../lib/store";

/** Desenha a frente do personagem a partir do PNG da skin (64×64 ou 64×32). */
export function SkinPreview({ url, variant, scale = 8 }: { url: string | null; variant: SkinVariant; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    const s = scale;
    const arm = variant === "slim" ? 3 : 4;
    // Silhueta (skin padrão ou sem imagem).
    const blank = () => {
      g.fillStyle = "#3a3a3a";
      g.fillRect(4 * s, 0, 8 * s, 8 * s);
      g.fillStyle = "#2c2c2c";
      g.fillRect(4 * s, 8 * s, 8 * s, 12 * s);
      g.fillRect((4 - arm) * s, 8 * s, arm * s, 12 * s);
      g.fillRect(12 * s, 8 * s, arm * s, 12 * s);
      g.fillStyle = "#242424";
      g.fillRect(4 * s, 20 * s, 4 * s, 12 * s);
      g.fillRect(8 * s, 20 * s, 4 * s, 12 * s);
    };
    if (!url) return blank();
    const img = new Image();
    img.onload = () => {
      const tall = img.height >= 64;
      const part = (sx: number, sy: number, w: number, h: number, dx: number, dy: number, flip = false) => {
        g.save();
        if (flip) {
          g.translate((dx + w) * s, 0);
          g.scale(-1, 1);
          g.drawImage(img, sx, sy, w, h, 0, dy * s, w * s, h * s);
        } else g.drawImage(img, sx, sy, w, h, dx * s, dy * s, w * s, h * s);
        g.restore();
      };
      const ax = 4 - arm;
      // Base
      part(8, 8, 8, 8, 4, 0); // cabeça
      part(20, 20, 8, 12, 4, 8); // corpo
      part(44, 20, arm, 12, ax, 8); // braço direito (lado esquerdo da tela)
      if (tall) part(36, 52, arm, 12, 12, 8);
      else part(44, 20, arm, 12, 12, 8, true);
      part(4, 20, 4, 12, 4, 20); // perna direita
      if (tall) part(20, 52, 4, 12, 8, 20);
      else part(4, 20, 4, 12, 8, 20, true);
      // Segunda camada
      part(40, 8, 8, 8, 4, 0);
      if (tall) {
        part(20, 36, 8, 12, 4, 8);
        part(44, 36, arm, 12, ax, 8);
        part(52, 52, arm, 12, 12, 8);
        part(4, 36, 4, 12, 4, 20);
        part(4, 52, 4, 12, 8, 20);
      }
    };
    img.onerror = blank;
    img.src = url;
  }, [url, variant, scale]);
  return <canvas ref={ref} width={16 * scale} height={32 * scale} className="[image-rendering:pixelated]" />;
}

/** Prévia 3D (skinview3d): andando, gira com o mouse, capa opcional. */
export function Skin3D({ url, variant, cape, paused, width = 340, height = 560, resetKey = 0 }: { url: string | null; variant: SkinVariant; cape?: string | null; paused?: boolean; width?: number; height?: number; resetKey?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<SkinViewer | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const v = new SkinViewer({ canvas: ref.current, width, height });
    v.background = null;
    v.fov = 40;
    v.zoom = 0.68;
    v.camera.position.set(28, 14, 42);
    v.animation = new WalkingAnimation();
    v.animation.speed = 0.7;
    v.controls.enableZoom = true;
    viewer.current = v;
    return () => {
      v.dispose();
      viewer.current = null;
    };
  }, [width, height]);
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    if (url) v.loadSkin(url, { model: variant === "slim" ? "slim" : "default" }).catch(() => v.resetSkin());
    else v.resetSkin();
  }, [url, variant]);
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    if (cape) v.loadCape(cape).catch(() => v.resetCape());
    else v.resetCape();
  }, [cape]);
  useEffect(() => {
    if (viewer.current?.animation) viewer.current.animation.paused = !!paused;
  }, [paused]);
  useEffect(() => {
    const v = viewer.current;
    if (!v || !resetKey) return;
    v.camera.position.set(28, 14, 42);
    v.controls.reset?.();
    v.zoom = 0.68;
  }, [resetKey]);
  return <canvas ref={ref} className="cursor-grab active:cursor-grabbing" />;
}

/** Skin da conta (minecraft.net). Sem acesso à Mojang, tenta o mc-heads. */
export function useAccountSkin() {
  const { account } = useApp();
  const [acc, setAcc] = useState<{ url: string; variant: SkinVariant } | null | undefined>(undefined);
  useEffect(() => {
    skinsApi
      .account()
      .then((a) => setAcc(a ?? (account ? { url: `https://mc-heads.net/skin/${account.uuid}`, variant: "classic" } : null)))
      .catch(() => setAcc(account ? { url: `https://mc-heads.net/skin/${account.uuid}`, variant: "classic" } : null));
  }, [account]);
  return acc;
}

/** Carrega a URL do PNG de cada skin (cache por id). */
export function useSkinUrls(skins: Skin[]) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  useEffect(() => {
    for (const s of skins) {
      if (s.id in urls) continue;
      skinsApi.url(s.id).then((u) => setUrls((m) => ({ ...m, [s.id]: u })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skins]);
  return urls;
}

/** Frente da capa (recorte 10×16 da textura 64×32) para o menu de capas. */
function CapeThumb({ url }: { url: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !url) return;
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    const img = new Image();
    img.onload = () => {
      const k = img.width / 64;
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(img, 1 * k, 1 * k, 10 * k, 16 * k, 0, 0, c.width, c.height);
    };
    img.src = url;
  }, [url]);
  return <canvas ref={ref} width={15} height={24} className="bg-raised [image-rendering:pixelated]" />;
}

const icon = {
  pause: <path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" />,
  play: <path d="M5 3l8 5-8 5z" fill="currentColor" />,
  reset: <path d="M8 3a5 5 0 1 1-4.6 3H1l3-3 3 3H5.5A3.5 3.5 0 1 0 8 4.5z" fill="currentColor" />,
};

/**
 * Estúdio de skins (estilo CurseForge): prévia 3D andando à esquerda com capas e Aplicar,
 * suas skins à direita. `selected = null` é a skin da própria conta.
 */
export function SkinPicker({ selected, onSelect, onApply, applyLabel = "Aplicar", note }: { selected: string | null; onSelect?: (id: string | null) => void; onApply: (id: string | null) => Promise<void>; applyLabel?: string; note?: string; previewLabel?: string; disabled?: boolean }) {
  const { account } = useApp();
  const [skins, setSkins] = useState<Skin[]>([]);
  const [pick, setPick] = useState<string | null>(selected);
  const [capes, setCapes] = useState<Cape[]>([]);
  const [capeMenu, setCapeMenu] = useState(false);
  const [paused, setPaused] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const urls = useSkinUrls(skins);
  const accSkin = useAccountSkin();
  const reload = () => skinsApi.list().then((l) => setSkins(l.skins));
  useEffect(() => {
    reload();
  }, []);
  useEffect(() => setPick(selected), [selected]);
  useEffect(() => {
    if (account) skinsApi.capes().then(setCapes).catch(() => setCapes([]));
  }, [account]);

  const current = skins.find((s) => s.id === pick) ?? null;
  const activeCape = capes.find((c) => c.active) ?? null;
  const name = current?.name ?? account?.name ?? "Sua skin";
  const dirty = pick !== selected;

  function choose(id: string | null) {
    setPick(id);
    setStatus(null);
    onSelect?.(id);
  }

  async function upload() {
    setStatus(null);
    try {
      const s = await skinsApi.add("classic");
      if (s) {
        await reload();
        choose(s.id);
      }
    } catch (e) {
      setStatus(String(e));
    }
  }

  async function setVariant(v: SkinVariant) {
    if (!current) return;
    await skinsApi.update({ ...current, variant: v });
    reload();
  }

  async function chooseCape(c: Cape | null) {
    setCapeMenu(false);
    const prev = capes;
    setCapes(capes.map((x) => ({ ...x, active: x.id === c?.id })));
    try {
      await skinsApi.setCape(c?.id ?? null);
    } catch (e) {
      setCapes(prev);
      setStatus(String(e));
    }
  }

  async function apply() {
    setBusy(true);
    setStatus(null);
    try {
      await onApply(pick);
      setStatus("Pronto! Já está na sua conta.");
    } catch (e) {
      setStatus(String(e));
    }
    setBusy(false);
  }

  const tool = "flex h-9 items-center justify-center bg-[#1c1c1c] text-[#bdbdbd] hover:bg-active hover:text-ink";

  return (
    <div className="flex gap-8">
      {/* Prévia */}
      <div className="flex w-[380px] shrink-0 flex-col bg-[#121212]">
        <div className="flex justify-center gap-4 pt-4 text-[11px] text-muted">
          <span>Arraste para girar</span>
          <span>·</span>
          <span>Role para zoom</span>
        </div>
        <div className="relative flex flex-1 justify-center" style={{ backgroundImage: "linear-gradient(#1a1a1a 1px, transparent 1px), linear-gradient(90deg, #1a1a1a 1px, transparent 1px)", backgroundSize: "28px 28px", backgroundPosition: "center" }}>
          <Skin3D url={current ? urls[current.id] ?? null : accSkin?.url ?? null} variant={current?.variant ?? accSkin?.variant ?? "classic"} cape={activeCape?.url} paused={paused} resetKey={resetKey} width={360} height={470} />
        </div>
        <div className="relative flex items-center gap-1.5 px-4 py-3">
          {account && (
            <button onClick={() => setCapeMenu((m) => !m)} className={`${tool} gap-2 px-3 text-xs font-medium`}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M3 2h10l1 12-3-1-3 1-3-1-3 1z" /></svg>
              Capas
            </button>
          )}
          <button onClick={() => setPaused((p) => !p)} title={paused ? "Animar" : "Pausar"} className={`${tool} w-9`}>
            <svg width="14" height="14" viewBox="0 0 16 16">{paused ? icon.play : icon.pause}</svg>
          </button>
          <button onClick={() => setResetKey((k) => k + 1)} title="Voltar a câmera" className={`${tool} w-9`}>
            <svg width="14" height="14" viewBox="0 0 16 16">{icon.reset}</svg>
          </button>
          {current && (
            <div className="ml-auto flex">
              {(["classic", "slim"] as const).map((v) => (
                <button key={v} onClick={() => setVariant(v)} className={`h-9 px-3 text-xs ${current.variant === v ? "bg-active text-ink" : "bg-[#1c1c1c] text-muted hover:text-soft"}`}>
                  {v === "classic" ? "Clássico" : "Slim"}
                </button>
              ))}
            </div>
          )}
          {capeMenu && (
            <div className="absolute bottom-full left-4 z-20 mb-1 w-56 bg-[#1c1c1c] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.6)]" onMouseLeave={() => setCapeMenu(false)}>
              <button onClick={() => chooseCape(null)} className={`flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] hover:bg-active ${!activeCape ? "text-ink" : "text-[#9a9a9a]"}`}>
                <span className="flex h-6 w-[15px] items-center justify-center bg-raised text-[11px]">—</span>
                Sem capa
              </button>
              {capes.map((c) => (
                <button key={c.id} onClick={() => chooseCape(c)} className={`flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] hover:bg-active ${c.active ? "text-ink" : "text-[#9a9a9a]"}`}>
                  <CapeThumb url={c.url} />
                  {c.alias}
                  {c.active && <span className="ml-auto text-[11px] text-muted">em uso</span>}
                </button>
              ))}
              {!capes.length && <p className="m-0 px-3 py-2 text-xs text-muted">Sua conta não tem capas.</p>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 bg-[#161616] px-4 py-3.5">
          <p className="m-0 min-w-0 flex-1 truncate text-[15px] font-semibold">{name}</p>
          {dirty && (
            <button onClick={() => choose(selected)} title="Desfazer" className={`${tool} w-9`}>
              <svg width="14" height="14" viewBox="0 0 16 16">{icon.reset}</svg>
            </button>
          )}
          <button disabled={busy} onClick={apply} className="h-9 bg-ink px-5 text-[13px] font-semibold text-[#111] hover:bg-white disabled:opacity-50">
            {busy ? "Aplicando…" : applyLabel}
          </button>
        </div>
      </div>

      {/* Skins */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <h3 className="m-0 text-lg font-semibold">Minhas skins</h3>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-3">
          <button onClick={upload} className="flex h-[190px] flex-col items-center justify-center gap-3 bg-[#161616] text-[#bdbdbd] hover:bg-[#1c1c1c] hover:text-ink">
            <span className="flex h-11 w-11 items-center justify-center bg-[#2a2a2a]">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M7 15h2V7l3 3 1.4-1.4L8 3.2 2.6 8.6 4 10l3-3z" /><path d="M2 1h12v2H2z" /></svg>
            </span>
            <span className="text-[13px] font-medium">Enviar skin</span>
          </button>
          <SkinTile name={account ? `${account.name} (conta)` : "Sua skin"} url={accSkin?.url ?? null} variant={accSkin?.variant ?? "classic"} on={pick === null} onClick={() => choose(null)} />
          {skins.map((s) => (
            <SkinTile
              key={s.id}
              name={s.name}
              url={urls[s.id] ?? null}
              variant={s.variant}
              on={s.id === pick}
              onClick={() => choose(s.id)}
              onRemove={async () => {
                await skinsApi.remove(s.id);
                if (s.id === pick) choose(null);
                reload();
              }}
            />
          ))}
        </div>
        <p className="m-0 text-xs text-muted">{status ?? note ?? ""}</p>
      </div>
    </div>
  );
}

function SkinTile({ name, url, variant, on, onClick, onRemove }: { name: string; url: string | null; variant: SkinVariant; on: boolean; onClick: () => void; onRemove?: () => void }) {
  return (
    <div className="group relative">
      <button onClick={onClick} className={`flex h-[190px] w-full flex-col ${on ? "bg-active outline-1 -outline-offset-1 outline-[#5a5a5a]" : "bg-[#161616] hover:bg-[#1c1c1c]"}`}>
        <span className="flex flex-1 items-center justify-center">
          <SkinPreview url={url} variant={variant} scale={4} />
        </span>
        <span className={`w-full truncate bg-black/20 px-3 py-2.5 text-left text-[13px] ${on ? "text-ink" : "text-[#bdbdbd]"}`}>{name}</span>
      </button>
      {onRemove && (
        <button onClick={onRemove} title="Remover skin" className="absolute top-1.5 right-1.5 hidden h-6 w-6 items-center justify-center bg-[#1c1c1c] text-muted group-hover:flex hover:text-[#e5484d]">
          <svg width="10" height="10" viewBox="0 0 14 14"><path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="1.8" /></svg>
        </button>
      )}
    </div>
  );
}
