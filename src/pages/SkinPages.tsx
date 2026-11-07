import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, skinsApi, type Instance } from "../lib/api";
import { useApp } from "../lib/store";
import { SkinPicker } from "../components/Skins";
import { PageHeader, Toggle } from "../components/ui";

const note = "A skin global é a skin da sua conta. Ao aplicar outra, a anterior fica guardada aqui no catálogo.";

/** Skin global: usada em todas as instâncias sem skin própria. */
export function SkinGlobalPage() {
  const [global, setGlobal] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    skinsApi.list().then((l) => setGlobal(l.global));
  }, []);
  if (global === undefined) return null;
  return (
    <div className="flex h-full flex-col gap-7 overflow-y-auto px-10 py-8">
      <PageHeader title="Skin global" subtitle="Usada em todas as instâncias, exceto nas que têm skin própria ativada" />
      <SkinPicker
        selected={global}
        applyLabel="Aplicar"
        resetOnApply
        onApply={async (id) => {
          if (id === null) return; // já é a skin atual
          await skinsApi.setAccountSkin(id);
          setGlobal(null);
        }}
      />
      <p className="m-0 max-w-[760px] text-xs leading-relaxed text-muted">Instâncias com a opção "Skin própria" ligada na aba Skins sobrepõem a skin global. {note}</p>
    </div>
  );
}

/** Aba Skins da instância. */
export function InstanceSkinsTab({ instance }: { instance: Instance }) {
  const { refresh } = useApp();
  const navigate = useNavigate();
  const [inst, setInst] = useState(instance);

  async function save(next: Instance) {
    setInst(next);
    await api.updateInstance(next);
    refresh();
  }

  return (
    <div className="flex flex-col gap-7 px-10 py-8">
      <div className="flex items-center gap-4 border border-line bg-[#141414] px-5 py-4">
        <div className="flex-1">
          <p className="m-0 text-sm font-semibold">Skin própria nesta instância</p>
          <p className="m-0 mt-0.5 text-xs text-muted">
            {inst.skin.enabled ? "Ao clicar em Jogar, sua skin é trocada para a escolhida abaixo" : "Desligado: esta instância usa a sua skin global"}
          </p>
        </div>
        <Toggle on={inst.skin.enabled} onChange={(v) => save({ ...inst, skin: { ...inst.skin, enabled: v } })} />
      </div>

      {inst.skin.enabled ? (
        <SkinPicker
          selected={inst.skin.skinId}
          applyLabel="Usar nesta instância"
          note="A skin é trocada na sua conta quando você clicar em Jogar nesta instância."
          onApply={async (id) => save({ ...inst, skin: { enabled: true, skinId: id } })}
        />
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="m-0 max-w-[620px] text-[13px] leading-relaxed text-[#9a9a9a]">
            Ligue "Skin própria" para escolher uma skin só para {inst.name}. Ela é aplicada automaticamente sempre que você der Jogar nesta instância.
          </p>
          <button onClick={() => navigate("/skin")} className="border border-edge px-4 py-2 text-[13px] text-[#d0d0d0] hover:bg-raised">
            Editar skin global
          </button>
        </div>
      )}
      <p className="m-0 text-xs text-muted">{note}</p>
    </div>
  );
}
