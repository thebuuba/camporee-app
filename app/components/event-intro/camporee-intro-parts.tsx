// Adapted from the user's camporee-adventista design in Polymet.
import type { CSSProperties } from "react";
export const cn = (...values: (string | false | undefined | null)[]) => values.filter(Boolean).join(" ");

export function anim(name: string, duration: number, delay: number, easing = "cubic-bezier(.2,.8,.2,1)"): CSSProperties {
  return { animation: `${name} ${duration}s ${easing} ${delay}s both` };
}

/* ---------- Animated word (letter by letter) ---------- */

interface AnimatedWordProps {
  text: string;
  delay: number;
  stagger?: number;
  gentle?: boolean;
  className?: string;
}

export function AnimatedWord({ text, delay, stagger = 0.06, gentle, className }: AnimatedWordProps) {
  return (
    <span className={cn("inline-flex", className)} aria-hidden="true">
      {Array.from(text).map((ch, i) => (
        <span
          key={`${text}-${i}`}
          className="inline-block"
          style={
            gentle
              ? anim("camp-intro-text", 1, delay + i * stagger, "ease-out")
              : anim("camp-intro-letter", 0.7, delay + i * stagger, "cubic-bezier(.3,1.4,.5,1)")
          }
        >
          {ch}
        </span>
      ))}
    </span>
  );
}

/* ---------- Stars ---------- */

const STARS = Array.from({ length: 34 }, (_, i) => ({
  id: `s-${i}`,
  left: (i * 41 + 11) % 100,
  top: (i * 23 + 5) % 55,
  size: 1 + (i % 3),
  delay: (i % 7) * 0.4,
}));

export function StarField({ appearAt = 0 }: { appearAt?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0" style={anim("camp-intro-fade", 1.6, appearAt, "ease")}>
      {STARS.map((s) => (
        <span
          key={s.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            animation: `camp-twinkle 2.6s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* ---------- Garland (never cropped: height follows width) ---------- */

const GARLAND_COLORS = ["fill-amber-300", "fill-orange-400", "fill-lime-400", "fill-rose-400", "fill-white"];

function GarlandSvg({ width, count, sag, className }: { width: number; count: number; sag: number; className?: string }) {
  const p0 = { x: -10, y: 10 };
  const p1 = { x: width / 2, y: 10 + sag * 2 };
  const p2 = { x: width + 10, y: 10 };
  const flags = Array.from({ length: count }, (_, i) => {
    const t = 0.03 + (i / (count - 1)) * 0.94;
    return {
      x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t ** 2 * p2.x,
      y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t ** 2 * p2.y,
    };
  });
  const height = 10 + sag + 22;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("block h-auto w-full", className)} aria-hidden="true">
      <path
        d={`M${p0.x} ${p0.y} Q ${p1.x} ${p1.y}, ${p2.x} ${p2.y}`}
        fill="none"
        strokeWidth="1.5"
        strokeDasharray={width * 1.4}
        className="stroke-white/60"
        style={
          {
            "--len": `${width * 1.4}`,
            animation: `camp-intro-draw 1.2s ease-out 2.1s both`,
          } as CSSProperties
        }
      />
      {flags.map((f, i) => (
        <polygon
          key={`gf-${i}`}
          points={`${f.x - 7},${f.y} ${f.x + 7},${f.y} ${f.x},${f.y + 16}`}
          className={GARLAND_COLORS[i % GARLAND_COLORS.length]}
          style={{
            transformBox: "fill-box",
            transformOrigin: "50% 0%",
            ...anim("camp-intro-pop", 0.5, 2.3 + i * 0.04),
          }}
        />
      ))}
    </svg>
  );
}

export function Garland() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0">
      <GarlandSvg width={400} count={13} sag={34} className="sm:hidden" />
      <GarlandSvg width={1100} count={30} sag={10} className="hidden max-h-28 sm:block" />
    </div>
  );
}

/* ---------- Confetti ---------- */

const CONFETTI_COLORS = ["bg-amber-300", "bg-orange-400", "bg-rose-400", "bg-lime-400", "bg-white"];

const CONFETTI = Array.from({ length: 48 }, (_, i) => ({
  id: `c-${i}`,
  left: (i * 37 + 7) % 100,
  delay: 2.3 + ((i * 13) % 22) / 10,
  duration: 3.4 + ((i * 7) % 16) / 10,
  dx: ((i * 29) % 50) - 25,
  rot: 360 + ((i * 47) % 540),
  w: 6 + (i % 3) * 2,
  h: 9 + (i % 4) * 3,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  round: i % 6 === 0,
}));

export function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden="true">
      {CONFETTI.map((c) => (
        <span
          key={c.id}
          className={cn("absolute top-0", c.color, c.round ? "rounded-full" : "rounded-[2px]")}
          style={
            {
              left: `${c.left}%`,
              width: c.w,
              height: c.round ? c.w : c.h,
              "--dx": `${c.dx}vw`,
              "--rot": `${c.rot}deg`,
              animation: `camp-intro-confetti ${c.duration}s cubic-bezier(.3,.6,.4,1) ${c.delay}s 2 both`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/* ---------- Floating lights (calm, for Sabbath) ---------- */

const LIGHTS = Array.from({ length: 26 }, (_, i) => ({
  id: `l-${i}`,
  left: (i * 43 + 5) % 100,
  bottom: 30 + ((i * 17) % 30),
  size: 3 + (i % 4) * 1.5,
  delay: 1.5 + ((i * 11) % 40) / 10,
  duration: 6 + ((i * 7) % 40) / 10,
}));

export function FloatingLights() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
      {LIGHTS.map((l) => (
        <span
          key={l.id}
          className="absolute rounded-full bg-amber-200 shadow-[0_0_12px_4px_rgba(253,230,138,0.55)]"
          style={{
            left: `${l.left}%`,
            bottom: `${l.bottom}%`,
            width: l.size,
            height: l.size,
            animation: `camp-intro-light ${l.duration}s ease-out ${l.delay}s infinite both`,
          }}
        />
      ))}
    </div>
  );
}
