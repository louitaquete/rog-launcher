import type { LoaderType } from "../lib/api";

/** Logos dos loaders: coloque `src/assets/loaders/<loader>.svg|png|webp` (ex.: fabric.svg). Sem arquivo, usa a sigla. */
const LOGOS = Object.fromEntries(
  Object.entries(import.meta.glob("../assets/loaders/*.{svg,png,webp}", { eager: true, import: "default" })).map(([k, v]) => [
    k.split("/").pop()!.replace(/\.(svg|png|webp)$/, "").toLowerCase(),
    v as string,
  ]),
);

const MARK: Record<string, string> = { Vanilla: "MC", Fabric: "FB", Forge: "FG", NeoForge: "NF", Quilt: "QT", OptiFine: "OF" };

export function LoaderIcon({ loader, size = 40 }: { loader: LoaderType; size?: number }) {
  const src = LOGOS[loader.toLowerCase()];
  if (src) return <img src={src} width={size} height={size} alt="" className="object-contain [image-rendering:pixelated]" style={{ width: size, height: size }} />;
  return (
    <span className="flex items-center justify-center border border-edge bg-raised font-brand font-black text-[#9a9a9a]" style={{ width: size, height: size, fontSize: size * 0.32 }}>
      {MARK[loader]}
    </span>
  );
}
