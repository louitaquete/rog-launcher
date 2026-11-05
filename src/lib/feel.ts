// EXPERIMENTAL: clarão quadrado no ponto do clique de qualquer botão ou link.
export function installFeel() {
  document.addEventListener(
    "pointerdown",
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("button:not(:disabled), a, [role=button]");
      if (!el || e.button !== 0) return;
      const r = el.getBoundingClientRect();
      if (getComputedStyle(el).position === "static") el.style.position = "relative";
      el.style.overflow = "hidden";
      const f = document.createElement("span");
      f.className = "rog-flash";
      f.style.left = `${e.clientX - r.left}px`;
      f.style.top = `${e.clientY - r.top}px`;
      el.appendChild(f);
      f.addEventListener("animationend", () => f.remove());
    },
    { passive: true },
  );
}
