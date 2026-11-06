import { useEffect, useState } from "react";
import { coverApi, type Instance } from "../lib/api";
import { LoaderIcon } from "./LoaderIcon";

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

const hasLoader = (i: Instance) => !["Vanilla", "OptiFine"].includes(i.loader.type);

/**
 * Capa da instância, nesta ordem:
 * 1. imagem escolhida (ou do modpack, salva ao instalar)
 * 2. com loader: o símbolo do loader, monocromático
 * 3. Vanilla/PVP: o banner da versão
 */
export function InstanceCover({ instance, mode }: { instance: Instance; mode: "card" | "hero" }) {
  const [cover, setCover] = useState<string | null>(null);
  useEffect(() => {
    if (instance.cover) coverApi.url(instance.id).then(setCover);
    else setCover(null);
  }, [instance.id, instance.cover]);

  const hero = mode === "hero";
  if (cover)
    return <img src={cover} alt="" className={`absolute inset-0 h-full w-full object-cover ${hero ? "opacity-60" : "transition-transform duration-200 group-hover:scale-105"}`} />;

  if (hasLoader(instance))
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-[#262626] to-[#171717]">
        <span className={`grayscale ${hero ? "absolute right-16 opacity-[0.12]" : "opacity-50 transition-transform duration-200 group-hover:scale-110"}`}>
          <LoaderIcon loader={instance.loader.type} size={hero ? 220 : 72} />
        </span>
      </div>
    );

  const art = versionArt(instance.mcVersion);
  if (!art) return <div className="absolute inset-0 bg-gradient-to-b from-[#262626] to-[#171717]" />;
  return (
    <img
      src={art}
      alt=""
      className={`absolute inset-0 h-full w-full object-cover ${hero ? "opacity-50" : "brightness-[.8] transition-[transform,filter] duration-200 group-hover:scale-105 group-hover:brightness-100"}`}
    />
  );
}
