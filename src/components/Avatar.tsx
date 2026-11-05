import { useState } from "react";

// Cabeça 8x8 em pixel art do jogador anônimo (mesmo desenho do Figma).
const C: Record<string, string> = { H: "#3A3A3A", S: "#8A8A8A", E: "#1A1A1A", W: "#EDEDED", D: "#6A6A6A", M: "#4A4A4A" };
const ROWS = ["HHHHHHHH", "HHHHHHHH", "HSSSSSSH", "SSSSSSSS", "SEWSSWES", "SSSDDSSS", "SSMMMMSS", "SSSSSSSS"];

export function AnonymousHead({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" className="outline outline-1 outline-edge">
      {ROWS.flatMap((row, y) => [...row].map((c, x) => <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={C[c]} />))}
    </svg>
  );
}

/** Cabeça da skin do jogador (mc-heads.net), com a anônima enquanto carrega ou sem internet. */
export function PlayerHead({ uuid, size = 32 }: { uuid: string; size?: number }) {
  const [ok, setOk] = useState(true);
  if (!ok) return <AnonymousHead size={size} />;
  return (
    <img
      src={`https://mc-heads.net/avatar/${uuid}/${size * 2}`}
      width={size}
      height={size}
      onError={() => setOk(false)}
      className="outline outline-1 outline-edge [image-rendering:pixelated]"
      alt=""
    />
  );
}
