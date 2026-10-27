import { SunIcon, SunsetIcon } from "lucide-react";

interface SabbathBannerProps {
  sunset: string;
  endsIn: { hours: number; minutes: number };
}

export function SabbathBanner({ sunset, endsIn }: SabbathBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-100 via-orange-50 to-amber-50 p-4 dark:from-amber-950/60 dark:via-stone-900 dark:to-amber-950/30">
      <SunIcon
        className="absolute -right-6 -top-6 size-28 text-amber-300/40 dark:text-amber-400/10"
        strokeWidth={1.25}
        aria-hidden="true"
      />
      <div className="relative">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">
          Día de reposo
        </p>
        <h3 className="mt-1 text-lg font-bold leading-tight text-foreground">¡Feliz sábado!</h3>
        <p className="mt-0.5 max-w-[85%] text-sm text-muted-foreground">
          Un día para adorar, descansar y disfrutar la creación juntos.
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-card/80 py-1.5 pl-2 pr-3 text-xs shadow-sm">
          <SunsetIcon className="size-4 text-primary" />
          <span className="text-muted-foreground">Termina</span>
          <span className="font-bold tabular-nums text-foreground">{sunset}</span>
          <span className="text-muted-foreground/60">·</span>
          <span className="tabular-nums text-muted-foreground">
            en {endsIn.hours}h {String(endsIn.minutes).padStart(2, "0")}m
          </span>
        </div>
      </div>
    </div>
  );
}
