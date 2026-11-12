import type { ButtonHTMLAttributes, ReactNode } from "react";
import { createPortal } from "react-dom";
import { icons, type IconName } from "./icons";

export function Icon({ name, size = 24, className = "" }: { name: IconName; size?: number; className?: string }) {
  return <img src={icons[name]} width={size} height={size} alt="" draggable={false} className={className} />;
}

type Variant = "primary" | "dark" | "outline" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-[#111] hover:bg-white",
  dark: "bg-active text-[#d0d0d0] hover:bg-[#2a2a2a]",
  outline: "border border-edge text-[#d0d0d0] hover:bg-raised",
  ghost: "text-[#d0d0d0] hover:bg-raised",
};

export function Button({
  variant = "dark",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-[6px] bg-active px-2 py-[3px] text-xs font-medium text-soft">{children}</span>;
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-[22px] w-10 transition-colors ${on ? "bg-ink" : "bg-active"}`}
    >
      <span
        className={`absolute top-[3px] h-4 w-4 rounded-[4px] transition-all ${on ? "left-[21px] bg-[#111]" : "left-[3px] bg-muted"}`}
      />
    </button>
  );
}

export function Modal({ title, subtitle, onClose, children, footer, width = 640, height }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number; height?: number }) {
  // Portal: renderiza no <body>. Dentro de um card com transform (hover), o "fixed" ficava preso ao card e piscava.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        style={{ width, height, maxWidth: "94vw" }}
        className="flex max-h-[90vh] flex-col overflow-hidden rounded-[14px] bg-surface text-left shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center px-7 pt-6 pb-4">
          <div className="flex-1">
            <h2 className="m-0 text-xl font-semibold text-ink">{title}</h2>
            {subtitle && <p className="m-0 mt-1 text-xs text-muted">{subtitle}</p>}
          </div>
          <button aria-label="Fechar" onClick={onClose} className="p-1 text-[#9a9a9a] hover:text-ink">
            <svg width="14" height="14" viewBox="0 0 12 12"><path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.3" /></svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6 [scrollbar-gutter:stable]">{children}</div>
        {footer && <div className="flex items-center gap-2 border-t border-line px-7 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <SectionLabel>{label}</SectionLabel>
      {children}
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </label>
  );
}

const control = "h-11 border border-transparent bg-raised px-3.5 text-sm text-ink outline-none focus:border-[#5a5a5f]";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} ${props.className ?? ""}`} />;
}

export function Select({ value, onChange, options, className = "" }: { value: string; onChange: (v: string) => void; options: { value: string; label: string; disabled?: boolean }[]; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${control} bg-raised ${className}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({ value, onChange, options, full }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; disabled?: boolean }[]; full?: boolean }) {
  return (
    <div className={`flex gap-0.5 rounded-[6px] bg-surface p-1 ${full ? "w-full" : ""}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`h-8 !rounded-[4px] px-3.5 text-sm font-medium disabled:opacity-35 ${full ? "flex-1" : ""} ${o.value === value ? "bg-active text-ink" : "text-muted hover:text-soft"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center">
      <div className="flex-1">
        <h1 className="m-0 text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="m-0 mt-1 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2.5">{actions}</div>}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[11px] font-medium tracking-[0.08em] text-[#8a8a8a] uppercase">{children}</p>;
}
