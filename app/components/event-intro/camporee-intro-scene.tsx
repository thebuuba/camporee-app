// Adapted from the user's camporee-adventista design in Polymet.
import type { CSSProperties } from "react";
import { anim } from "./camporee-intro-parts";
import { cn } from "./camporee-intro-parts";

export type IntroSceneVariant = "sunrise" | "sunset";

const FROM_BOTTOM: CSSProperties = { transformBox: "fill-box", transformOrigin: "50% 100%" };

/**
 * Wide 1200×300 canvas. Key elements (sun, tents, fire, flag) live in the
 * central 440–760 band so nothing important is cropped on phones, and the
 * sun sits low enough to never be clipped on very wide screens.
 */
const CX = 600;
const SUN_Y = 172;

const PALETTE: Record<
  IntroSceneVariant,
  { glow: string; rays: string; sun: string; far: string; farPine: string; mid: string; nearPine: string; front: string; flag: string }
> = {
  sunrise: {
    glow: "fill-amber-200/30",
    rays: "stroke-amber-100/50",
    sun: "fill-amber-300",
    far: "fill-rose-400/80",
    farPine: "fill-rose-800/60",
    mid: "fill-orange-400/90",
    nearPine: "fill-indigo-950/85",
    front: "fill-amber-100",
    flag: "fill-amber-300",
  },
  sunset: {
    glow: "fill-orange-200/30",
    rays: "stroke-amber-200/40",
    sun: "fill-orange-300",
    far: "fill-violet-400/70",
    farPine: "fill-violet-900/55",
    mid: "fill-rose-400/85",
    nearPine: "fill-indigo-950/85",
    front: "fill-amber-50",
    flag: "fill-amber-200",
  },
};

const PINES_FAR = [
  { x: 120, y: 196, s: 0.9 },
  { x: 170, y: 200, s: 0.7 },
  { x: 330, y: 196, s: 0.85 },
  { x: 380, y: 200, s: 0.65 },
  { x: 850, y: 192, s: 0.8 },
  { x: 900, y: 196, s: 0.65 },
  { x: 1040, y: 190, s: 0.9 },
  { x: 1090, y: 196, s: 0.7 },
];

const PINES_NEAR = [
  { x: 30, y: 258, s: 1.3 },
  { x: 84, y: 264, s: 1 },
  { x: 240, y: 256, s: 1.15 },
  { x: 446, y: 258, s: 1.05 },
  { x: 776, y: 256, s: 1.1 },
  { x: 960, y: 258, s: 1.2 },
  { x: 1120, y: 262, s: 1 },
  { x: 1172, y: 254, s: 1.3 },
];

const TENTS = [
  { x: 520, y: 270, s: 1.25 },
  { x: 610, y: 256, s: 0.72 },
  { x: 684, y: 266, s: 1.05 },
  { x: 330, y: 268, s: 0.95 },
  { x: 870, y: 270, s: 1 },
];

function Pine({ x, y, s, className, delay }: { x: number; y: number; s: number; className: string; delay: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className={className} style={{ ...FROM_BOTTOM, ...anim("camp-intro-pop", 0.6, delay) }}>
        <rect x="-2.5" y="0" width="5" height="14" className="fill-indigo-950/70" />
        <polygon points="0,-50 -15,-24 15,-24" />
        <polygon points="0,-38 -20,-7 20,-7" />
        <polygon points="0,-22 -25,6 25,6" />
      </g>
    </g>
  );
}

function Tent({ x, y, s, delay, glow }: { x: number; y: number; s: number; delay: number; glow: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g style={{ ...FROM_BOTTOM, ...anim("camp-intro-pop", 0.7, delay) }}>
        <ellipse cx="0" cy="-8" rx="28" ry="17" className={glow ? "fill-amber-200/45" : "fill-amber-200/25"} />
        <polygon points="0,-34 -34,0 34,0" className="fill-white" />
        <polygon points="0,-34 34,0 14,0" className="fill-orange-100" />
        <polygon points="0,-20 -10,0 10,0" className="fill-amber-300" />
        <line x1="0" y1="-34" x2="0" y2="-41" strokeWidth="2.2" strokeLinecap="round" className="stroke-orange-900/70" />
      </g>
    </g>
  );
}

interface CamporeeIntroSceneProps {
  variant?: IntroSceneVariant;
  className?: string;
}

export function CamporeeIntroScene({ variant = "sunrise", className }: CamporeeIntroSceneProps) {
  const p = PALETTE[variant];
  const sunset = variant === "sunset";

  return (
    <svg
      viewBox="0 0 1200 300"
      preserveAspectRatio="xMidYMax slice"
      className={cn("h-full w-full", className)}
      aria-hidden="true"
    >
      {/* Sun */}
      <g
        style={{
          transformBox: 'view-box',
          transformOrigin: `${CX}px ${SUN_Y}px`,
          ...(sunset
            ? anim("camp-intro-sunset", 5, 0.2, "cubic-bezier(.4,0,.2,1)")
            : anim("camp-intro-sun", 2.2, 0.2)),
        }}
      >
        <g style={{ transformOrigin: `${CX}px ${SUN_Y}px`, animation: "camp-glow 5s ease-in-out 2.4s infinite" }}>
          <circle cx={CX} cy={SUN_Y} r="96" className={p.glow} />
          <circle cx={CX} cy={SUN_Y} r="78" className={p.glow} />
        </g>
        <g
          className={p.rays}
          strokeWidth="5"
          strokeLinecap="round"
          style={{
            transformOrigin: `${CX}px ${SUN_Y}px`,
            animation: `camp-spin ${sunset ? 90 : 50}s linear infinite, camp-intro-fade 1.2s ease 1.4s both`,
          }}
        >
          {Array.from({ length: 16 }, (_, i) => {
            const a = (i * Math.PI * 2) / 16;
            return (
              <line
                key={`ray-${i}`}
                x1={CX + Math.cos(a) * 72}
                y1={SUN_Y + Math.sin(a) * 72}
                x2={CX + Math.cos(a) * 92}
                y2={SUN_Y + Math.sin(a) * 92}
              />
            );
          })}
        </g>
        <circle cx={CX} cy={SUN_Y} r="58" className={p.sun} />
        <circle cx={CX - 14} cy={SUN_Y - 14} r="20" className="fill-white/25" />
      </g>

      {/* Hills */}
      <path
        d="M0 200 C 150 162, 300 172, 450 190 S 700 160, 850 180 S 1100 164, 1200 174 L1200 300 L0 300 Z"
        className={p.far}
        style={{ ...FROM_BOTTOM, ...anim("camp-intro-up", 1.2, 0.5) }}
      />
      {PINES_FAR.map((pine, i) => (
        <Pine key={`pf-${pine.x}`} {...pine} className={p.farPine} delay={1.0 + i * 0.05} />
      ))}
      <path
        d="M0 236 C 200 206, 380 214, 560 226 S 880 200, 1040 214 S 1160 222, 1200 216 L1200 300 L0 300 Z"
        className={p.mid}
        style={{ ...FROM_BOTTOM, ...anim("camp-intro-up", 1.2, 0.7) }}
      />

      {/* Flag */}
      <g style={anim("camp-intro-fade", 0.4, 1.6)}>
        <line x1="730" y1="238" x2="730" y2="152" strokeWidth="3" strokeLinecap="round" className="stroke-orange-950/70" />
        <circle cx="730" cy="150" r="3" className="fill-amber-200" />
      </g>
      <g style={anim("camp-intro-raise", 1.1, 1.8)}>
        <g style={{ transformOrigin: "730px 158px", animation: "camp-flag 2.4s ease-in-out 2.9s infinite" }}>
          <polygon points="730,154 772,164 730,176" className={p.flag} />
        </g>
      </g>

      {PINES_NEAR.map((pine, i) => (
        <Pine key={`pn-${pine.x}`} {...pine} className={p.nearPine} delay={1.2 + i * 0.06} />
      ))}

      <path
        d="M0 272 C 220 252, 420 262, 600 264 S 900 252, 1200 260 L1200 300 L0 300 Z"
        className={p.front}
        style={{ ...FROM_BOTTOM, ...anim("camp-intro-up", 1.1, 0.9) }}
      />

      {TENTS.map((t, i) => (
        <Tent key={`t-${t.x}`} {...t} glow={sunset} delay={1.5 + i * 0.12} />
      ))}

      {/* Campfire */}
      <g transform={`translate(${CX} 284)`}>
        <g style={{ ...FROM_BOTTOM, ...anim("camp-intro-pop", 0.6, 2.1) }}>
          <circle cx="0" cy="-10" r="30" className="fill-amber-300/30" />
          <g style={{ transformOrigin: "0px 2px", animation: "camp-intro-flame 0.9s ease-in-out 2.7s infinite" }}>
            <path d="M0 -28 C 11 -12, 13 -3, 0 3 C -13 -3, -11 -12, 0 -28 Z" className="fill-orange-500" />
            <path d="M0 -14 C 5 -6, 6 -1, 0 3 C -6 -1, -5 -6, 0 -14 Z" className="fill-amber-300" />
          </g>
          <rect x="-15" y="1" width="30" height="4" rx="2" transform="rotate(12)" className="fill-orange-950/70" />
          <rect x="-15" y="1" width="30" height="4" rx="2" transform="rotate(-12)" className="fill-orange-950/70" />
        </g>
      </g>
    </svg>
  );
}
