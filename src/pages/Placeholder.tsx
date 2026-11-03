// Tela ainda não implementada: mostra só o título, no lugar certo da navegação.
export function Placeholder({ title, note = "Em construção — o design está no Figma." }: { title: string; note?: string }) {
  return (
    <div className="flex h-full flex-col gap-2 px-10 py-8">
      <h1 className="m-0 text-2xl font-semibold text-ink">{title}</h1>
      <p className="m-0 text-[13px] text-muted">{note}</p>
    </div>
  );
}
