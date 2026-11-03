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
