import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./shared";

interface CamporeeClubStripProps {
  title: ReactNode;
  subtitle: ReactNode;
  icon?: LucideIcon;
  people?: {id:string;full_name:string}[];
  extraCount?: number;
  trailing?: ReactNode;
  tone?: "default" | "gold";
  className?: string;
}

export function CamporeeClubStrip({
  title,
  subtitle,
  icon: Icon,
  people,
  extraCount = 0,
  trailing,
  tone = "default",
  className,
}: CamporeeClubStripProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-3 py-2.5",
        className,
      )}
    >
      {people && people.length > 0 ? (
        <div className="flex shrink-0 -space-x-2">
          {people.map(person => (
            <span key={person.id} title={person.full_name} className="flex size-8 items-center justify-center rounded-full border-2 border-card bg-secondary text-[10px] font-bold text-secondary-foreground">{person.full_name.charAt(0).toUpperCase()}</span>
          ))}
          {extraCount > 0 && (
            <span className="flex size-8 items-center justify-center rounded-full border-2 border-card bg-accent text-[10px] font-bold text-accent-foreground">
              +{extraCount}
            </span>
          )}
        </div>
      ) : Icon ? (
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl",
            tone === "gold"
              ? "bg-gradient-to-br from-amber-300 to-orange-500 text-white"
              : "bg-accent text-primary",
          )}
        >
          <Icon className="size-[18px]" />
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight text-foreground">{title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>

      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}
