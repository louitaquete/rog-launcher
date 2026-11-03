import { instances, type Kind } from "../data/instances";
import { InstanceCard, NewInstanceCard } from "../components/InstanceCard";
import { Button, PageHeader, SectionLabel } from "../components/ui";

const copy: Record<"all" | Exclude<Kind, "pvp">, { title: string; subtitle: string }> = {
  all: { title: "Início", subtitle: "Todas as suas instâncias em um só lugar" },
  vanilla: { title: "Vanilla", subtitle: "Instâncias sem mods, do jeito que a Mojang fez" },
  mods: { title: "Mods", subtitle: "Instâncias com loader e mods" },
};

// Início mostra Vanilla e PVP primeiro, depois as de mods.
const order: Record<Kind, number> = { vanilla: 0, pvp: 1, mods: 2 };

export function InstanceList({ filter }: { filter: "all" | "vanilla" | "mods" }) {
  const list = instances
    .filter((i) => filter === "all" || i.kind === filter)
    .filter((i) => filter !== "all" || i.kind !== "vanilla" || i.id === "vanilla")
    .sort((a, b) => order[a.kind] - order[b.kind]);
  const { title, subtitle } = copy[filter];

  return (
    <div className="flex h-full flex-col gap-7 overflow-y-auto px-10 py-8">
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            <Button variant="dark" className="border border-edge">Importar</Button>
            <Button variant="primary">+ Nova instância</Button>
          </>
        }
      />
      <SectionLabel>Instâncias</SectionLabel>
      <div className="flex flex-wrap gap-5">
        {list.map((i) => (
          <InstanceCard key={i.id} instance={i} />
        ))}
        <NewInstanceCard />
      </div>
    </div>
  );
}
