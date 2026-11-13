import { useEffect, useRef, useState } from "react";
import { accountApi, type DeviceCode } from "../lib/api";
import { useApp } from "../lib/store";
import { Button, Modal } from "./ui";

/** Login Microsoft por código: o usuário digita o código em microsoft.com/link. */
export function LoginModal() {
  const { loginOpen, setLoginOpen, setAccount } = useApp();
  const [code, setCode] = useState<DeviceCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  async function begin() {
    setError(null);
    setCode(null);
    try {
      const c = await accountApi.start();
      setCode(c);
      const acc = await accountApi.wait();
      setAccount(acc);
      setLoginOpen(false);
    } catch (e) {
      const msg = String(e);
      if (msg.includes("CANCELLED")) return;
      setError(msg.replace(/^(NO_GAME|NEEDS_ACCOUNT): /, ""));
    }
  }

  useEffect(() => {
    if (!loginOpen) {
      started.current = false;
      return;
    }
    if (started.current) return;
    started.current = true;
    begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginOpen]);

  if (!loginOpen) return null;

  const close = () => {
    accountApi.cancel();
    setLoginOpen(false);
  };

  return (
    <Modal title="Entrar com a Microsoft" subtitle="Use a conta que tem o Minecraft: Java Edition." onClose={close} width={520}>
      <div className="flex flex-col items-center gap-5 py-2 text-center">
        {error ? (
          <>
            <p className="m-0 text-sm text-soft">{error}</p>
            <Button variant="primary" onClick={begin}>Tentar de novo</Button>
          </>
        ) : !code ? (
          <p className="m-0 text-sm text-muted">Pedindo um código à Microsoft…</p>
        ) : (
          <>
            <p className="m-0 text-sm text-muted">
              Abrimos <span className="text-ink">{code.verificationUri.replace(/^https:\/\/(www\.)?/, "")}</span> no navegador. Digite este código lá:
            </p>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(code.userCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              title="Copiar"
              className="border border-edge bg-raised px-8 py-4 font-brand text-4xl font-black tracking-[0.18em] text-ink hover:bg-active"
            >
              {code.userCode}
            </button>
            <span className="h-4 text-xs text-muted">{copied ? "Copiado!" : "Clique no código para copiar"}</span>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="h-1.5 w-1.5 animate-pulse bg-muted" />
              Esperando você confirmar no navegador…
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
