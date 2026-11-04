import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Navigate, useParams } from "react-router-dom";
import { api, type Settings } from "../lib/api";
import { useApp } from "../lib/store";
import { Button, Icon, Segmented, Select, TextInput, Toggle } from "../components/ui";

const SECTIONS = [
  { slug: "geral", label: "Geral", sub: "Preferências do launcher e do jogo" },
  { slug: "java", label: "Java e memória", sub: "Padrão para todas as instâncias (cada uma pode sobrescrever na aba Configurações)" },
  { slug: "aparencia", label: "Aparência", sub: "Como o launcher se parece" },
  { slug: "conta", label: "Conta", sub: "Contas Microsoft conectadas ao launcher" },
  { slug: "downloads", label: "Downloads", sub: "Onde e como o Rog baixa jogos e mods" },
  { slug: "sobre", label: "Sobre", sub: "Informações do launcher" },
] as const;

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex w-[900px] max-w-full flex-col gap-2.5">
      <p className="m-0 text-[11px] font-medium tracking-[0.08em] text-[#6a6a6a] uppercase">{title}</p>
      <div className="flex flex-col border border-line bg-surface [&>*+*]:border-t [&>*+*]:border-line">{children}</div>
    </section>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-6 px-5 py-4">
      <div className="flex-1">
        <p className="m-0 text-sm font-medium text-ink">{title}</p>
        {desc && <p className="m-0 mt-0.5 text-xs text-muted">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function Memory({ value, onChange, min = 1024, max = 16384 }: { value: number; onChange: (mb: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center gap-3.5">
      <input
        type="range"
        min={min}
        max={max}
        step={512}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rog-range w-[200px]"
        style={{ background: `linear-gradient(to right, #d9d9d9 ${((value - min) / (max - min)) * 100}%, #2a2a2a 0)` }}
      />
      <span className="w-14 text-right text-[13px] font-medium">{(value / 1024).toFixed(value % 1024 ? 1 : 0)} GB</span>
    </div>
  );
}

/** Campo de texto que só grava ao sair dele, para não salvar a cada tecla. */
function CommitInput({ value, onCommit, className = "w-[260px]", type = "text" }: { value: string; onCommit: (v: string) => void; className?: string; type?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <TextInput type={type} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} className={className} />;
}

export function SettingsPage() {
  const { section = "geral" } = useParams();
  const { settings, updateSettings, devOffline } = useApp();
  const [dataDir, setDataDir] = useState("");
  const [version, setVersion] = useState("");
  useEffect(() => {
    api.dataDir().then(setDataDir);
    api.appVersion().then(setVersion);
  }, []);

  const current = SECTIONS.find((s) => s.slug === section);
  if (!current) return <Navigate to="/config/geral" replace />;
  if (!settings) return null;

  const set = <K extends keyof Settings>(key: K, patch: Partial<Settings[K]>) => updateSettings((s) => ({ ...s, [key]: { ...s[key], ...patch } }));
  const { general, java, launch, downloads, appearance } = settings;

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-[#111] py-7">
        <p className="m-0 px-6 pb-3 text-[11px] font-medium tracking-[0.08em] text-[#6a6a6a] uppercase">Configurações</p>
        {SECTIONS.map((s) => (
          <NavLink
            key={s.slug}
            to={`/config/${s.slug}`}
            className={({ isActive }) =>
              `relative flex h-10 items-center px-6 text-[13px] font-medium no-underline ${isActive ? "bg-raised text-ink" : "text-[#8a8a8a] hover:text-soft"}`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute top-0 left-0 h-10 w-0.5 bg-[#e6e6e6]" />}
                {s.label}
              </>
            )}
          </NavLink>
        ))}
      </aside>

      <div className="flex flex-1 flex-col gap-8 overflow-y-auto px-12 py-9">
        <div>
          <h1 className="m-0 text-2xl font-semibold">{current.label}</h1>
          <p className="m-0 mt-1 text-[13px] text-muted">{current.sub}</p>
        </div>

        {section === "geral" && (
          <Group title="Geral">
            <Row title="Idioma" desc="Idioma da interface do launcher">
              <Select value={general.language} onChange={(v) => set("general", { language: v })} options={[{ value: "pt-BR", label: "Português (Brasil)" }, { value: "en", label: "English (em breve)", disabled: true }]} className="w-[260px]" />
            </Row>
            <Row title="Ao abrir o jogo" desc="O que o launcher faz quando o Minecraft inicia">
              <Select value={general.onLaunch} onChange={(v) => set("general", { onLaunch: v as Settings["general"]["onLaunch"] })} options={[{ value: "minimize", label: "Minimizar o launcher" }, { value: "keepOpen", label: "Deixar aberto" }, { value: "close", label: "Fechar o launcher" }]} className="w-[260px]" />
            </Row>
            <Row title="Iniciar com o Windows" desc="Abre o launcher junto com o sistema">
              <Toggle on={general.startWithSystem} onChange={(v) => set("general", { startWithSystem: v })} />
            </Row>
            <Row title="Atualizações automáticas" desc="Baixa novas versões do launcher em segundo plano">
              <Toggle on={general.autoUpdate} onChange={(v) => set("general", { autoUpdate: v })} />
            </Row>
            {devOffline && (
              <Row title="Nick do modo de teste" desc="Build de desenvolvedor: o jogo abre offline com este nome">
                <CommitInput value={general.devNickname} onCommit={(v) => set("general", { devNickname: v.trim().slice(0, 16) || "Jogador" })} className="w-[200px]" />
              </Row>
            )}
            <Row title="Aviso do Kill game" desc={general.killWarningDismissed ? "Desligado: o Kill game fecha o jogo direto" : "Aparece antes de forçar o fechamento do jogo"}>
              <Toggle on={!general.killWarningDismissed} onChange={(v) => set("general", { killWarningDismissed: !v })} />
            </Row>
          </Group>
        )}

        {section === "java" && (
          <>
            <Group title="Memória">
              <Row title="Memória alocada padrão" desc="RAM máxima usada pelas instâncias">
                <Memory value={java.maxMemoryMb} onChange={(mb) => set("java", { maxMemoryMb: mb, minMemoryMb: Math.min(java.minMemoryMb, mb) })} />
              </Row>
              <Row title="Memória mínima" desc="Reservada ao abrir o jogo">
                <Memory value={java.minMemoryMb} max={java.maxMemoryMb} min={512} onChange={(mb) => set("java", { minMemoryMb: mb })} />
              </Row>
            </Group>
            <Group title="Java">
              <Row title="Versão do Java" desc="O Rog baixa e escolhe a versão certa para cada Minecraft">
                <Select value={java.javaPath ? "custom" : "auto"} onChange={(v) => set("java", { javaPath: v === "auto" ? null : java.javaPath ?? "" })} options={[{ value: "auto", label: "Automático (recomendado)" }, { value: "custom", label: "Caminho personalizado" }]} className="w-[260px]" />
              </Row>
              {java.javaPath !== null && (
                <Row title="Caminho do Java" desc="Ex.: C:\Program Files\Java\jdk-21\bin\javaw.exe">
                  <CommitInput value={java.javaPath} onCommit={(v) => set("java", { javaPath: v })} className="w-[360px]" />
                </Row>
              )}
              <Row title="Argumentos JVM padrão" desc="Aplicados em todas as instâncias">
                <CommitInput value={java.jvmArgs} onCommit={(v) => set("java", { jvmArgs: v })} className="w-[360px]" />
              </Row>
            </Group>
            <Group title="Inicialização padrão">
              <Row title="Pular intro da Mojang" desc={'Tela "Mojang Studios" escura e limpa'}>
                <Toggle on={launch.skipMojangIntro} onChange={(v) => set("launch", { skipMojangIntro: v })} />
              </Row>
              <Row title="Tela cheia" desc="Abrir os jogos em tela cheia">
                <Toggle on={launch.fullscreen} onChange={(v) => set("launch", { fullscreen: v })} />
              </Row>
              <Row title="Resolução da janela" desc="Tamanho padrão em modo janela">
                <div className="flex items-center gap-2">
                  <CommitInput type="number" value={String(launch.width)} onCommit={(v) => set("launch", { width: Number(v) || launch.width })} className="w-20" />
                  <span className="text-muted">×</span>
                  <CommitInput type="number" value={String(launch.height)} onCommit={(v) => set("launch", { height: Number(v) || launch.height })} className="w-20" />
                </div>
              </Row>
            </Group>
          </>
        )}

        {section === "aparencia" && (
          <Group title="Interface">
            <Row title="Escala da interface" desc="Tamanho de textos e botões">
              <Segmented value={String(appearance.uiScale)} onChange={(v) => set("appearance", { uiScale: Number(v) })} options={["90", "100", "110", "125"].map((v) => ({ value: v, label: `${v}%` }))} />
            </Row>
            <Row title="Animações" desc="Transições e efeitos de hover">
              <Toggle on={appearance.animations} onChange={(v) => set("appearance", { animations: v })} />
            </Row>
            <Row title="Mostrar tempo jogado" desc="Nos cards e na aba Jogar">
              <Toggle on={appearance.showPlayTime} onChange={(v) => set("appearance", { showPlayTime: v })} />
            </Row>
          </Group>
        )}

        {section === "conta" && (
          <Group title="Contas">
            <Row title="Nenhuma conta conectada" desc="O login com a Microsoft chega quando a Mojang aprovar o app" />
          </Group>
        )}

        {section === "downloads" && (
          <>
            <Group title="Armazenamento">
              <Row title="Pasta do launcher" desc={dataDir}>
                <Button variant="outline" onClick={() => api.openFolder()}>Abrir pasta</Button>
              </Row>
            </Group>
            <Group title="Mods">
              <Row title="Fonte de mods preferida" desc="Usada na busca de mods">
                <Segmented value={downloads.modSource} onChange={(v) => set("downloads", { modSource: v })} options={[{ value: "modrinth", label: "Modrinth" }, { value: "curseForge", label: "CurseForge" }, { value: "both", label: "Ambas" }]} />
              </Row>
              <Row title="Atualizar mods automaticamente" desc="Ao abrir uma instância">
                <Toggle on={downloads.autoUpdateMods} onChange={(v) => set("downloads", { autoUpdateMods: v })} />
              </Row>
            </Group>
            <Group title="Rede">
              <Row title="Downloads simultâneos" desc="Mais rápido, porém usa mais conexão">
                <Segmented value={String(downloads.concurrent)} onChange={(v) => set("downloads", { concurrent: Number(v) })} options={["2", "4", "8", "16"].map((v) => ({ value: v, label: v }))} />
              </Row>
              <Row title="Limite de velocidade" desc="0 = sem limite (MB/s)">
                <CommitInput type="number" value={String(downloads.speedLimitMbps)} onCommit={(v) => set("downloads", { speedLimitMbps: Math.max(0, Number(v) || 0) })} className="w-24" />
              </Row>
            </Group>
          </>
        )}

        {section === "sobre" && (
          <>
            <div className="flex w-[900px] max-w-full items-center gap-5 border border-line bg-surface p-6">
              <Icon name="logo" size={60} />
              <div className="flex-1">
                <p className="m-0 font-brand text-[22px] font-bold">Rog Launcher</p>
                <p className="m-0 mt-1 text-[13px] text-muted">Versão {version}</p>
              </div>
            </div>
            <p className="m-0 text-[11px] text-faint">
              Rog Launcher não é afiliado à Mojang ou à Microsoft. Minecraft é marca da Mojang Synergies AB.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
