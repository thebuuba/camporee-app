// Adapted from the user's camporee-adventista design in Polymet.
import { ArrowRightIcon, MapPinIcon, SparklesIcon } from "lucide-react";
import { IntroShell } from "./intro-shell";
import { AnimatedWord, Confetti, Garland, StarField, anim } from "./camporee-intro-parts";

interface CamporeeModeIntroProps {
  organizer: string;
  theme: string;
  verseRef: string;
  memberName: string;
  club: string;
  dateLabel: string;
  location: string;
  currentDay: number;
  totalDays: number;
  onClose: () => void;
}

export function CamporeeModeIntro({
  organizer,
  theme,
  verseRef,
  memberName,
  club,
  dateLabel,
  location,
  currentDay,
  totalDays,
  onClose,
}: CamporeeModeIntroProps) {
  return (
    <IntroShell
      ariaLabel="Modo Camporee activado"
      skyBase="bg-indigo-950"
      skyOverlay="from-violet-950 via-rose-500 to-amber-200"
      sceneVariant="sunrise"
      groundClass="bg-amber-100"
      backLayer={
        <>
          <StarField />
          <Garland />
        </>
      }
      frontLayer={<Confetti />}
      cta={{
        label: "Entrar al camporee",
        icon: ArrowRightIcon,
        className:
          "bg-gradient-to-r from-orange-500 to-rose-500 shadow-[0_14px_30px_-12px_rgba(234,88,12,0.8)] focus-visible:ring-orange-300",
      }}
      info={
        <p className="flex flex-wrap items-center justify-center gap-1.5">
          <span className="font-bold text-orange-600">
            Día {currentDay} de {totalDays}
          </span>
          <span aria-hidden="true">·</span>
          {dateLabel}
          <span aria-hidden="true">·</span>
          <MapPinIcon className="size-3" />
          {location}
        </p>
      }
      headline={
        <>
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/70" style={anim("camp-intro-text", 0.8, 0.4)}>
            {organizer} presenta
          </p>

          <h1 className="mt-3 font-extrabold leading-[0.95] tracking-tight drop-shadow-[0_6px_24px_rgba(76,29,149,0.45)]">
            <span className="sr-only">Modo Camporee</span>
            <AnimatedWord text="Modo" delay={0.8} className="text-[clamp(2.4rem,11vw,4.25rem)]" />
            <br />
            <AnimatedWord text="Camporee" delay={1.1} className="text-[clamp(3.2rem,16vw,6.25rem)] text-amber-200" />
          </h1>

          <div
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-3.5 py-1.5 text-sm font-semibold backdrop-blur"
            style={anim("camp-intro-pop", 0.6, 1.9)}
          >
            <span className="relative flex size-2">
              <span
                className="absolute inline-flex size-full rounded-full bg-lime-300"
                style={{ animation: "camp-intro-ring 1.6s ease-out 2.4s infinite" }}
              />
              <span className="relative inline-flex size-2 rounded-full bg-lime-300" />
            </span>
            Activado
            <SparklesIcon className="size-3.5 text-amber-200" />
          </div>

          <p className="mt-5 max-w-xs text-lg font-semibold leading-snug [text-wrap:balance]" style={anim("camp-intro-text", 0.9, 2.3)}>
            “{theme}”
            <span className="mt-0.5 block text-xs font-medium text-white/70">{verseRef}</span>
          </p>

          <p className="mt-3 text-sm text-white/90" style={anim("camp-intro-text", 0.9, 2.6)}>
            ¡Bienvenido, <span className="font-bold">{memberName}</span>!{" "}
            <span className="text-white/75">
              {club}
            </span>
          </p>
        </>
      }
      onClose={onClose}
    />
  );
}
