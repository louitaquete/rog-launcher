import type { ButtonHTMLAttributes, ReactNode } from "react";
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
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="bg-[#262626] px-2 py-[3px] text-[11px] font-medium text-soft">{children}</span>;
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-[22px] w-10 transition-colors ${on ? "bg-[#d9d9d9]" : "bg-[#2a2a2a]"}`}
    >
      <span
        className={`absolute top-[3px] h-4 w-4 transition-all ${on ? "left-[21px] bg-[#111]" : "left-[3px] bg-muted"}`}
      />
    </button>
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
  return <p className="m-0 text-[11px] font-medium tracking-[0.08em] text-[#6a6a6a] uppercase">{children}</p>;
}
