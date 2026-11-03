// Controles da janela sem moldura. No navegador (npm run dev) viram no-op.
const isTauri = "__TAURI_INTERNALS__" in window;

async function current() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export const windowControls = {
  minimize: async () => isTauri && (await current()).minimize(),
  toggleMaximize: async () => isTauri && (await current()).toggleMaximize(),
  close: async () => isTauri && (await current()).close(),
};
