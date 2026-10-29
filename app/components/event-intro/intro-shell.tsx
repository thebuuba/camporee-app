// Adapted from the user's camporee-adventista design in Polymet.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { XIcon, type LucideIcon } from "lucide-react";
import { anim, cn } from "./camporee-intro-parts";
import { CamporeeIntroScene, type IntroSceneVariant } from "./camporee-intro-scene";

interface IntroShellProps {
  ariaLabel: string;
  /** Background visible at the very start (e.g. night). */
  skyBase: string;
  /** Gradient that fades in over the base (e.g. dawn). */
  skyOverlay: string;
  skyDuration?: number;
  sceneVariant: IntroSceneVariant;
  /** Solid color matching the scene's front ground, used behind the CTA. */
  groundClass: string;
  backLayer?: ReactNode;
  frontLayer?: ReactNode;
  headline: ReactNode;
  cta: { label: string; icon: LucideIcon; className: string; shineDelay?: number; delay?: number };
  info?: ReactNode;
  onClose: () => void;
}

export function IntroShell({
  ariaLabel,
  skyBase,
  skyOverlay,
  skyDuration = 2.8,
  sceneVariant,
  groundClass,
  backLayer,
  frontLayer,
  headline,
  cta,
  info,
  onClose,
}: IntroShellProps) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const closeTimer = useRef<number|null>(null);
  const CtaIcon = cta.icon;
  const ctaDelay = cta.delay ?? 3;

  const handleClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    closeTimer.current=window.setTimeout(onClose,window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:520);
  }, [onClose]);

  useEffect(() => {
    const element=dialog.current;
    const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      if(closeTimer.current!==null)window.clearTimeout(closeTimer.current);
      element?.close();
      document.body.style.overflow = prevOverflow;
      if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});
    };
  }, [handleClose]);

  return (
    <dialog
      ref={dialog}
      onCancel={event=>{event.preventDefault();handleClose();}}
      aria-modal="true"
      aria-label={ariaLabel}
      className={cn(
        "camp-intro fixed inset-0 z-[100] flex flex-col overflow-hidden font-sans",
        skyBase,
        closing && "intro-closing",
      )}
    >
      <div className={cn("absolute inset-0 bg-gradient-to-b", skyOverlay)} style={anim("camp-intro-fade", skyDuration, 0.2, "ease-in-out")} />
      {backLayer}

      <button
        type="button"
        onClick={handleClose}
        className="absolute right-4 top-4 z-40 inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        style={anim("camp-intro-fade", 0.5, 0.8)}
      >
        Saltar
        <XIcon className="size-3.5" />
      </button>

      <div className="intro-headline relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-2 pt-20 text-center text-white">
        {headline}
      </div>

      <div className="intro-landscape relative h-[40vh] max-h-[400px] min-h-[200px] shrink-0">
        <CamporeeIntroScene variant={sceneVariant} className="absolute inset-0" />
      </div>

      <div
        className={cn(
          "intro-footer relative z-10 -mt-px flex flex-col items-center gap-3 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-1",
          groundClass,
        )}
      >
        <button
          type="button"
          onClick={handleClose}
          className={cn(
            "group relative inline-flex h-14 w-full max-w-xs items-center justify-center gap-2 overflow-hidden rounded-full px-7 text-base font-bold text-white transition-transform hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4",
            cta.className,
          )}
          style={anim("camp-intro-text", 0.8, ctaDelay)}
        >
          <span
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent"
            style={{ animation: `camp-intro-shine 2.8s ease-in-out ${cta.shineDelay ?? ctaDelay + 0.8}s infinite` }}
          />
          {cta.label}
          <CtaIcon className="size-5 transition-transform group-hover:translate-x-0.5" />
        </button>
        {info && (
          <div className="text-xs font-medium text-stone-600" style={anim("camp-intro-text", 0.8, ctaDelay + 0.2)}>
            {info}
          </div>
        )}
      </div>

      {frontLayer}
    </dialog>
  );
}
