// Dados falsos até existir o backend de instâncias.
export type Kind = "vanilla" | "pvp" | "mods";
export type Loader = "Vanilla" | "Fabric" | "Forge" | "NeoForge" | "Quilt";

export interface Instance {
  id: string;
  name: string;
  kind: Kind;
  mcVersion?: string; // escondida em Vanilla padrão e PVP
  loader: Loader;
  tag?: string; // sobrescreve o chip do loader (ex.: "Competitivo")
}

export const instances: Instance[] = [
  { id: "vanilla", name: "Minecraft Vanilla", kind: "vanilla", loader: "Vanilla" },
  { id: "pvp", name: "Minecraft PVP", kind: "pvp", loader: "Vanilla", tag: "Competitivo" },
  { id: "alexs-mobs", name: "Alex's Mobs", kind: "mods", mcVersion: "1.20.1", loader: "Forge" },
  { id: "distant-horizons", name: "Distant Horizons", kind: "mods", mcVersion: "1.21.1", loader: "NeoForge" },
  { id: "shaders", name: "Shaders", kind: "mods", mcVersion: "1.21.1", loader: "Fabric" },
  { id: "backrooms", name: "Backrooms", kind: "mods", mcVersion: "1.20.2", loader: "Fabric" },
  { id: "hardcore", name: "Hardcore", kind: "vanilla", mcVersion: "1.21.4", loader: "Vanilla" },
  { id: "nostalgia", name: "Nostalgia 1.12", kind: "vanilla", mcVersion: "1.12.2", loader: "Vanilla" },
];
