import type { Instance } from "../lib/api";
import { useCover } from "../lib/tint";

/** Banners das versões (os mesmos do PVP). */
const ART: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob("../assets/pvp/*.{webp,jpg,jpeg,png}", { eager: true, import: "default" })).map(([k, v]) => [
    k.split("/").pop()!.replace(/\.(webp|jpe?g|png)$/, ""),
    v as string,
  ]),
);
const BASES = Object.keys(ART)
  .map((b) => ({ b, minor: Number(b.split(".")[1]) }))
  .sort((a, z) => a.minor - z.minor);

/** Banner da versão mais próxima (1.21.4 → 1.21; 1.19 → 1.18; versões novas tipo 26.x → a mais recente). */
export function versionArt(mc: string): string | null {
  if (!BASES.length) return null;
  const [major, minor] = mc.split(".").map(Number);
  if (major !== 1 || Number.isNaN(minor)) return ART[BASES[BASES.length - 1].b];
  const pick = [...BASES].reverse().find((x) => x.minor <= minor) ?? BASES[0];
  return ART[pick.b];
}

/**
 * Capa da instância, nesta ordem:
 * 1. imagem escolhida (ou do modpack, salva ao instalar)
 * 2. Vanilla/PVP: o banner da versão
 * 3. com loader e sem imagem: capa gerada (tom do nome + inicial)
 */
export function InstanceCover({ instance, mode }: { instance: Instance; mode: "card" | "hero" | "mini" }) {
  const { url, tint } = useCover(instance);
  const hero = mode === "hero";
  if (url)
    return <img src={url} alt="" className={`absolute inset-0 h-full w-full object-cover ${hero ? "" : "transition-[transform,filter] duration-200 group-hover:scale-[1.03] group-hover:brightness-110"}`} />;
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#131316]" style={{ backgroundImage: `linear-gradient(to bottom, rgb(${tint} / 0.6), rgb(${tint} / 0.05))` }}>
      <span
        className={`absolute font-brand leading-none font-bold text-white/10 select-none ${hero ? "top-1/2 right-16 -translate-y-1/2 text-[200px]" : mode === "mini" ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[22px] !text-white/40" : "top-[10%] left-[8%] text-[clamp(40px,7vw,120px)] transition-transform duration-200 group-hover:scale-105"}`}
      >
        {(instance.name.trim()[0] ?? "R").toUpperCase()}
      </span>
    </div>
  );
}
