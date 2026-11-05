import { useEffect, useRef, useState } from "react";
import { skinsApi, type Skin, type SkinVariant } from "../lib/api";

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

/**
 * Painel do Figma: prévia grande à esquerda (com Clássico/Slim) e "Suas skins" à direita.
 * `selected = null` é a skin padrão do jogo.
 */
export function SkinPicker({ selected, onSelect, previewLabel, disabled }: { selected: string | null; onSelect: (id: string | null) => void; previewLabel: string; disabled?: boolean }) {
  const [skins, setSkins] = useState<Skin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const urls = useSkinUrls(skins);
  const reload = () => skinsApi.list().then((l) => setSkins(l.skins));
  useEffect(() => {
    reload();
  }, []);

  const current = skins.find((s) => s.id === selected) ?? null;

  async function upload() {
    setError(null);
    try {
      const s = await skinsApi.add("classic");
      if (s) {
        await reload();
        onSelect(s.id);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function setVariant(v: SkinVariant) {
    if (!current) return;
    await skinsApi.update({ ...current, variant: v });
    reload();
  }

  return (
    <div className={`flex gap-8 ${disabled ? "pointer-events-none opacity-40" : ""}`}>
      <div className="flex w-[260px] shrink-0 flex-col items-center gap-4 border border-line bg-[#141414] px-6 py-8">
        <SkinPreview url={current ? urls[current.id] ?? null : null} variant={current?.variant ?? "classic"} scale={9} />
        <div className="text-center">
          <p className="m-0 text-sm font-semibold">{current?.name ?? "Padrão"}</p>
          <p className="m-0 mt-0.5 text-xs text-muted">{previewLabel}</p>
        </div>
        {current && (
          <div className="flex w-full border border-edge">
            {(["classic", "slim"] as const).map((v) => (
              <button key={v} onClick={() => setVariant(v)} className={`h-9 flex-1 text-xs font-medium ${current.variant === v ? "bg-active text-ink" : "text-[#9a9a9a] hover:text-soft"}`}>
                {v === "classic" ? "Clássico" : "Slim"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className="m-0 font-brand text-[11px] font-bold tracking-[0.14em] text-[#9a9a9a]">SUAS SKINS</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3">
          <SkinTile name="Padrão" url={null} variant="classic" on={selected === null} onClick={() => onSelect(null)} />
          {skins.map((s) => (
            <SkinTile
              key={s.id}
              name={s.name}
              url={urls[s.id] ?? null}
              variant={s.variant}
              on={s.id === selected}
              onClick={() => onSelect(s.id)}
              onRemove={async () => {
                await skinsApi.remove(s.id);
                if (s.id === selected) onSelect(null);
                reload();
              }}
            />
          ))}
          <button onClick={upload} className="flex h-[196px] flex-col items-center justify-center gap-1.5 border border-dashed border-edge text-[#6a6a6a] hover:border-[#4a4a4a] hover:text-soft">
            <span className="text-2xl">+</span>
            <span className="text-[13px] font-medium">Enviar skin</span>
            <span className="text-[11px]">.png 64×64</span>
          </button>
        </div>
        {error && <p className="m-0 text-xs text-[#9a9a9a]">{error}</p>}
      </div>
    </div>
  );
}

function SkinTile({ name, url, variant, on, onClick, onRemove }: { name: string; url: string | null; variant: SkinVariant; on: boolean; onClick: () => void; onRemove?: () => void }) {
  return (
    <div className="group relative">
      <button
        onClick={onClick}
        className={`flex h-[196px] w-full flex-col items-center justify-end gap-2.5 border pb-3 ${on ? "border-[#454545] bg-active" : "border-line bg-[#141414] hover:border-[#3a3a3a] hover:bg-[#181818]"}`}
      >
        <SkinPreview url={url} variant={variant} scale={4} />
        <span className={`max-w-full truncate px-2 text-xs ${on ? "text-ink" : "text-[#9a9a9a]"}`}>{name}</span>
      </button>
      {onRemove && (
        <button
          onClick={onRemove}
          title="Remover skin"
          className="absolute top-1.5 right-1.5 hidden h-6 w-6 items-center justify-center bg-[#1c1c1c] text-muted group-hover:flex hover:text-[#e5484d]"
        >
          <svg width="10" height="10" viewBox="0 0 14 14"><path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="1.8" /></svg>
        </button>
      )}
    </div>
  );
}
