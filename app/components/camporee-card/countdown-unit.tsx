import { cn } from "./shared";

interface CountdownUnitProps {
  value: number;
  label: string;
  highlight?: boolean;
  className?: string;
}

export function CountdownUnit({ value, label, highlight, className }: CountdownUnitProps) {
  const display = String(value).padStart(2, "0");

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card px-2 py-2",
        "shadow-[0_6px_20px_-10px_hsl(var(--primary)/0.35)]",
        className,
      )}
    >
      <span className="relative h-8 overflow-hidden text-[28px] font-bold leading-8 tracking-tight tabular-nums">
        <span
          key={display}
          className={cn(
            "block animate-in fade-in slide-in-from-top-2 duration-300",
            highlight ? "text-primary/70" : "text-primary",
          )}
        >
          {display}
        </span>
      </span>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
