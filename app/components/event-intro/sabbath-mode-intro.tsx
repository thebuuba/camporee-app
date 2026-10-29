// Adapted from the user's camporee-adventista design in Polymet.
import { ArrowRightIcon, BookOpenIcon, MapPinIcon, SunsetIcon } from "lucide-react";
import { IntroShell } from "./intro-shell";
import { AnimatedWord, FloatingLights, StarField, anim } from "./camporee-intro-parts";

interface SabbathModeIntroProps {
  memberName: string;
  nextActivity?: { title: string; start: string; location: string };
  onClose: () => void;
}

export function SabbathModeIntro({ memberName, nextActivity, onClose }: SabbathModeIntroProps) {
  return (
    <IntroShell
      ariaLabel="Feliz sábado"
      skyBase="bg-amber-300"
      skyOverlay="from-indigo-900 via-rose-400 to-amber-200"
      skyDuration={4.5}
      sceneVariant="sunset"
      groundClass="bg-amber-50"
      backLayer={<StarField appearAt={2.8} />}
      frontLayer={<FloatingLights />}
      cta={{
        label: "Recibir el sábado",
        icon: ArrowRightIcon,
        className:
          "bg-gradient-to-r from-amber-500 to-orange-500 shadow-[0_14px_30px_-12px_rgba(217,119,6,0.8)] focus-visible:ring-amber-300",
        delay: 3.4,
      }}
      info={
        nextActivity && (
          <p className="flex flex-wrap items-center justify-center gap-1.5">
            <span className="font-bold text-amber-700">{nextActivity.start}</span>
            <span>{nextActivity.title}</span>
            <span aria-hidden="true">·</span>
            <MapPinIcon className="size-3" />
            {nextActivity.location}
          </p>
        )
      }
      headline={
        <>
          <div
            className="relative mb-4 flex size-14 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30 backdrop-blur"
            style={anim("camp-intro-pop", 0.8, 0.5)}
          >
            <span
              className="absolute size-14 rounded-full bg-amber-200/30"
              style={{ animation: "camp-intro-ring 2.6s ease-out 1.4s infinite" }}
            />
            <BookOpenIcon className="relative size-6 text-amber-100" />
          </div>

          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/75" style={anim("camp-intro-text", 0.9, 0.7)}>
            Recepción del sábado
          </p>

          <h1 className="mt-3 font-extrabold leading-[0.95] tracking-tight drop-shadow-[0_6px_24px_rgba(76,29,149,0.4)]">
            <span className="sr-only">Feliz sábado</span>
            <AnimatedWord text="Feliz" delay={1} stagger={0.09} gentle className="text-[clamp(2.4rem,11vw,4.25rem)]" />
            <br />
            <AnimatedWord text="Sábado" delay={1.4} stagger={0.09} gentle className="text-[clamp(3.2rem,16vw,6.25rem)] text-amber-100" />
          </h1>

          <div
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-3.5 py-1.5 text-sm font-semibold backdrop-blur"
            style={anim("camp-intro-text", 0.8, 2.2)}
          >
            <span className="size-2 rounded-full bg-amber-200 shadow-[0_0_8px_2px_rgba(253,230,138,0.8)]" />
            Día de reposo
          </div>

          <p className="mt-5 max-w-xs text-lg font-semibold leading-snug [text-wrap:balance]" style={anim("camp-intro-text", 1, 2.6)}>
            “Acuérdate del día de reposo para santificarlo.”
            <span className="mt-0.5 block text-xs font-medium text-white/70">Éxodo 20:8</span>
          </p>

          <p className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-sm text-white/90" style={anim("camp-intro-text", 1, 3)}>
            <SunsetIcon className="size-4 text-amber-200" />
            ¡Feliz sábado, <span className="font-bold">{memberName}</span>!
          </p>
        </>
      }
      onClose={onClose}
    />
  );
}
