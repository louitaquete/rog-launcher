// Busca e instalação de conteúdo pelo Modrinth (api.modrinth.com/v2).
import { contentApi, type ContentKind, type Instance } from "./api";

const API = "https://api.modrinth.com/v2";

export interface Hit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  follows: number;
  icon_url: string | null;
  categories?: string[];
  date_modified?: string;
  url?: string | null;
  featured_gallery?: string | null;
}

interface Version {
  id: string;
  version_number: string;
  version_type: "release" | "beta" | "alpha";
  files: { url: string; filename: string; primary: boolean; hashes: { sha1: string } }[];
  dependencies: { project_id: string | null; version_id: string | null; dependency_type: string }[];
}

export type Sort = "relevance" | "downloads" | "follows" | "updated";

const projectType: Record<ContentKind, string> = { mod: "mod", resourcepack: "resourcepack", shader: "shader" };

/** Loaders do Modrinth que servem para a instância. */
export function loadersFor(inst: Instance, kind: ContentKind): string[] {
  if (kind === "resourcepack") return [];
  if (kind === "shader") return ["iris", "optifine"];
  switch (inst.loader.type) {
    case "Fabric":
      return ["fabric"];
    case "Quilt":
      return ["quilt", "fabric"];
    case "Forge":
      return ["forge"];
    case "NeoForge":
      return ["neoforge"];
    default:
      return [];
  }
}

/** Que tipos de conteúdo a instância aceita. */
export function kindsFor(inst: Instance): ContentKind[] {
  return loadersFor(inst, "mod").length ? ["mod", "resourcepack", "shader"] : ["resourcepack"];
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(API + path);
  if (!r.ok) throw new Error(`Modrinth: HTTP ${r.status}`);
  return r.json();
}

export async function search(inst: Instance, kind: ContentKind, query: string, sort: Sort, offset = 0) {
  const facets: string[][] = [[`project_type:${projectType[kind]}`], [`versions:${inst.mcVersion}`]];
  const loaders = loadersFor(inst, kind);
  if (kind === "mod" && loaders.length) facets.push(loaders.map((l) => `categories:${l}`));
  const q = new URLSearchParams({ query, index: sort, limit: "24", offset: String(offset), facets: JSON.stringify(facets) });
  return get<{ hits: Hit[]; total_hits: number }>(`/search?${q}`);
}

async function bestVersion(inst: Instance, kind: ContentKind, projectId: string): Promise<Version | null> {
  const q = new URLSearchParams({ game_versions: JSON.stringify([inst.mcVersion]) });
  const loaders = loadersFor(inst, kind);
  if (loaders.length) q.set("loaders", JSON.stringify(loaders));
  const list = await get<Version[]>(`/project/${projectId}/version?${q}`);
  return list.find((v) => v.version_type === "release") ?? list[0] ?? null;
}

/** Instala o projeto e as dependências obrigatórias. Devolve os títulos instalados. */
export async function install(inst: Instance, kind: ContentKind, projectId: string, done = new Set<string>()): Promise<string[]> {
  if (done.has(projectId)) return [];
  done.add(projectId);
  const [project, version] = await Promise.all([
    get<{ title: string; icon_url: string | null }>(`/project/${projectId}`),
    bestVersion(inst, kind, projectId),
  ]);
  if (!version) throw new Error(`${project.title} não tem versão para ${inst.mcVersion}`);
  const file = version.files.find((f) => f.primary) ?? version.files[0];
  await contentApi.install(inst.id, {
    url: file.url,
    sha1: file.hashes.sha1,
    meta: {
      kind,
      file: file.filename,
      source: "modrinth",
      projectId,
      versionId: version.id,
      versionNumber: version.version_number,
      title: project.title,
      iconUrl: project.icon_url,
    },
  });
  const installed = [project.title];
  for (const d of version.dependencies) {
    if (d.dependency_type !== "required" || !d.project_id) continue;
    installed.push(...(await install(inst, kind === "shader" ? "mod" : kind, d.project_id, done)));
  }
  return installed;
}

export const fmtCount = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".0", "")} mi` : n >= 1e3 ? `${Math.round(n / 1e3)} mil` : String(n);

/** Atualiza o que veio do Modrinth para a versão mais nova compatível. Devolve quantos mudaram. */
export async function updateAll(inst: Instance): Promise<number> {
  const items = await contentApi.list(inst.id);
  let n = 0;
  for (const i of items) {
    if (i.meta?.source !== "modrinth") continue;
    try {
      const v = await bestVersion(inst, i.kind, i.meta.projectId);
      if (v && v.id !== i.meta.versionId) {
        await install(inst, i.kind, i.meta.projectId);
        n++;
      }
    } catch {
      /* sem internet ou projeto removido: segue com os outros */
    }
  }
  return n;
}

/** Busca modpacks no Modrinth. */
export async function searchModpacks(query: string, offset = 0) {
  const q = new URLSearchParams({ query, index: "relevance", limit: "20", offset: String(offset), facets: JSON.stringify([["project_type:modpack"]]) });
  return get<{ hits: Hit[]; total_hits: number }>(`/search?${q}`);
}

/** URL do .mrpack mais recente (release) de um modpack. */
export async function modpackFile(projectId: string): Promise<string> {
  const versions = await get<Version[]>(`/project/${projectId}/version`);
  const v = versions.find((x) => x.version_type === "release") ?? versions[0];
  const file = v?.files.find((f) => f.primary) ?? v?.files[0];
  if (!file) throw new Error("esse modpack não tem arquivo para baixar");
  return file.url;
}
