// Tom de cada instância: sai da capa quando há imagem, ou do nome quando não há.
import { useEffect, useState } from "react";
import { coverApi, type Instance } from "./api";
import { versionArt } from "../components/InstanceCover";

const cache = new Map<string, string>();

/** Cor estável a partir do nome, "r g b". */
export function nameTint(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360, s = 0.42, l = 0.5;
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `${f(0)} ${f(8)} ${f(4)}`;
}

/** Cor dominante da imagem (média dos pixels mais saturados), "r g b". */
export function imageTint(url: string): Promise<string | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url)!);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 16;
        const g = c.getContext("2d")!;
        g.drawImage(img, 0, 0, 16, 16);
        const d = g.getImageData(0, 0, 16, 16).data;
        let r = 0, gr = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          const k = (mx - mn) / 255 + 0.05; // pixels coloridos pesam mais
          r += d[i] * k; gr += d[i + 1] * k; b += d[i + 2] * k; w += k;
        }
        const t = `${Math.round(r / w)} ${Math.round(gr / w)} ${Math.round(b / w)}`;
        cache.set(url, t);
        resolve(t);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export const hasLoader = (i: Instance) => !["Vanilla", "OptiFine"].includes(i.loader.type);

/** URL da capa (ou null quando ela é gerada) e o tom da instância. */
export function useCover(instance: Instance): { url: string | null; tint: string } {
  const [url, setUrl] = useState<string | null>(null);
  const [tint, setTint] = useState(() => nameTint(instance.name));
  useEffect(() => {
    let live = true;
    const fallback = hasLoader(instance) ? null : versionArt(instance.mcVersion);
    (instance.cover ? coverApi.url(instance.id).catch(() => fallback) : Promise.resolve(fallback)).then(async (u) => {
      if (!live) return;
      setUrl(u);
      const t = u ? await imageTint(u) : null;
      if (live) setTint(t ?? nameTint(instance.name));
    });
    return () => {
      live = false;
    };
  }, [instance.id, instance.cover, instance.name, instance.mcVersion, instance.loader.type]);
  return { url, tint };
}
