import { cn } from "./shared";

import {getTimeOfDay,sceneCoordinate,type TimeOfDay} from '@/lib/camporee-card';
const SUNRISE=6.5;
const SUNSET=20.3;
// The original illustration uses a decorative clock arc, not an astronomical forecast.

interface ScenePalette {
  bg: string;
  glow: string;
  orb: string;
  cloud: string;
  farHill: string;
  farPine: string;
  midHill: string;
  nearPine: string;
  front: string;
  flag: string;
  tentWall: string;
  tentShade: string;
}

const PALETTES: Record<TimeOfDay, ScenePalette> = {
  madrugada: {
    bg: "from-slate-950 via-indigo-950 to-indigo-800 dark:to-stone-900",
    glow: "fill-indigo-200/10",
    orb: "fill-slate-100",
    cloud: "fill-white/5",
    farHill: "fill-indigo-800/80 dark:fill-indigo-900/60",
    farPine: "fill-indigo-950/80",
    midHill: "fill-indigo-900/70 dark:fill-indigo-950/70",
    nearPine: "fill-slate-950/90",
    front: "fill-indigo-200 dark:fill-stone-800",
    flag: "fill-rose-400/80",
    tentWall: "fill-indigo-100 dark:fill-indigo-200",
    tentShade: "fill-indigo-200 dark:fill-indigo-300",
  },
  amanecer: {
    bg: "from-orange-200 via-rose-100 to-amber-50 dark:from-orange-950/70 dark:via-rose-950/40 dark:to-stone-900",
    glow: "fill-amber-200/70 dark:fill-amber-500/15",
    orb: "fill-amber-300 dark:fill-amber-400/90",
    cloud: "fill-rose-50/80 dark:fill-white/10",
    farHill: "fill-orange-200/80 dark:fill-orange-900/40",
    farPine: "fill-orange-400/70 dark:fill-orange-800/70",
    midHill: "fill-orange-300/70 dark:fill-orange-800/40",
    nearPine: "fill-orange-600/90 dark:fill-orange-700",
    front: "fill-orange-100 dark:fill-stone-800",
    flag: "fill-orange-400 dark:fill-orange-500",
    tentWall: "fill-white dark:fill-stone-200",
    tentShade: "fill-orange-100 dark:fill-stone-300",
  },
  manana: {
    bg: "from-amber-100 via-yellow-50 to-lime-50 dark:from-amber-950/60 dark:via-stone-900 dark:to-stone-900",
    glow: "fill-yellow-200/70 dark:fill-yellow-500/15",
    orb: "fill-yellow-300 dark:fill-yellow-400/90",
    cloud: "fill-white/90 dark:fill-white/10",
    farHill: "fill-lime-200/70 dark:fill-lime-900/30",
    farPine: "fill-emerald-500/50 dark:fill-emerald-800/60",
    midHill: "fill-orange-200/80 dark:fill-orange-900/40",
    nearPine: "fill-emerald-700/80 dark:fill-emerald-800",
    front: "fill-orange-100 dark:fill-stone-800",
    flag: "fill-orange-500",
    tentWall: "fill-white dark:fill-stone-200",
    tentShade: "fill-orange-100 dark:fill-stone-300",
  },
  tarde: {
    bg: "from-sky-300 via-sky-100 to-amber-50 dark:from-sky-950/70 dark:via-stone-900 dark:to-stone-900",
    glow: "fill-yellow-100/70 dark:fill-yellow-400/10",
    orb: "fill-yellow-300 dark:fill-yellow-400/90",
    cloud: "fill-white dark:fill-white/10",
    farHill: "fill-emerald-200/80 dark:fill-emerald-900/40",
    farPine: "fill-emerald-500/60 dark:fill-emerald-800/60",
    midHill: "fill-lime-200/80 dark:fill-lime-900/30",
    nearPine: "fill-emerald-700/85 dark:fill-emerald-800",
    front: "fill-amber-50 dark:fill-stone-800",
    flag: "fill-orange-500",
    tentWall: "fill-white dark:fill-stone-200",
    tentShade: "fill-orange-100 dark:fill-stone-300",
  },
  atardecer: {
    bg: "from-orange-300 via-rose-300 to-amber-100 dark:from-orange-900/70 dark:via-rose-950/60 dark:to-stone-900",
    glow: "fill-orange-200/60 dark:fill-orange-500/20",
    orb: "fill-orange-400 dark:fill-orange-500",
    cloud: "fill-rose-100/70 dark:fill-rose-200/10",
    farHill: "fill-rose-300/80 dark:fill-rose-900/50",
    farPine: "fill-rose-500/60 dark:fill-rose-800/70",
    midHill: "fill-orange-300/70 dark:fill-orange-900/50",
    nearPine: "fill-rose-800/80 dark:fill-rose-900",
    front: "fill-orange-100 dark:fill-stone-800",
    flag: "fill-amber-300",
    tentWall: "fill-orange-50 dark:fill-stone-200",
    tentShade: "fill-rose-200 dark:fill-stone-300",
  },
  noche: {
    bg: "from-indigo-950 via-indigo-800 to-violet-400 dark:via-indigo-950 dark:to-stone-900",
    glow: "fill-indigo-200/15",
    orb: "fill-amber-50",
    cloud: "fill-white/10",
    farHill: "fill-indigo-700/80 dark:fill-indigo-900/60",
    farPine: "fill-indigo-900/70 dark:fill-indigo-950",
    midHill: "fill-violet-800/60 dark:fill-violet-950/60",
    nearPine: "fill-indigo-950/90",
    front: "fill-violet-200 dark:fill-stone-800",
    flag: "fill-rose-400",
    tentWall: "fill-indigo-100 dark:fill-indigo-200",
    tentShade: "fill-violet-200 dark:fill-indigo-300",
  },
};

const STARS = [
  { x: 40, y: 26, r: 1.4, d: 0 },
  { x: 92, y: 48, r: 1, d: 0.8 },
  { x: 128, y: 18, r: 1.6, d: 1.6 },
  { x: 176, y: 56, r: 1, d: 0.4 },
  { x: 214, y: 24, r: 1.3, d: 1.2 },
  { x: 252, y: 64, r: 0.9, d: 2 },
  { x: 268, y: 16, r: 1.2, d: 0.6 },
  { x: 300, y: 84, r: 1, d: 1.8 },
  { x: 340, y: 22, r: 1.1, d: 2.4 },
  { x: 372, y: 30, r: 1.4, d: 1.4 },
  { x: 384, y: 74, r: 1, d: 0.2 },
  { x: 150, y: 86, r: 0.8, d: 1 },
  { x: 70, y: 90, r: 0.9, d: 2.2 },
];

const FIREFLIES = [
  { x: 96, y: 172, d: 0 },
  { x: 160, y: 182, d: 1.2 },
  { x: 256, y: 176, d: 0.6 },
  { x: 318, y: 184, d: 1.8 },
  { x: 210, y: 188, d: 2.4 },
];

const GARLAND_COLORS = ["fill-orange-400", "fill-amber-300", "fill-lime-500", "fill-rose-400"];

function garlandPoints() {
  const p0 = { x: 58, y: 112 };
  const p1 = { x: 176, y: 146 };
  const p2 = { x: 292, y: 100 };
  return Array.from({ length: 11 }, (_, i) => {
    const t = 0.06 + (i / 10) * 0.88;
    const x = (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t ** 2 * p2.x;
    const y = (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t ** 2 * p2.y;
    return { x, y };
  });
}

/** Position of sun or moon along an arc on the right side of the sky. */
function getOrb(hour: number) {
  const isSun = hour >= SUNRISE && hour < SUNSET;
  const span = isSun ? SUNSET - SUNRISE : 24 - (SUNSET - SUNRISE);
  const elapsed = isSun ? hour - SUNRISE : (hour - SUNSET + 24) % 24;
  const t = Math.min(1, Math.max(0, elapsed / span));
  return {
    isSun,
    x: sceneCoordinate(240 + 100 * t),
    y: sceneCoordinate(158 - 120 * Math.sin(Math.PI * t)),
  };
}

const FILL_T = "transition-[fill] duration-1000";

interface PineProps {
  x: number;
  y: number;
  scale?: number;
}

function Pine({ x, y, scale = 1 }: PineProps) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x="-2" y="0" width="4" height="12" className="fill-orange-900/60 dark:fill-orange-950" />
      <polygon points="0,-46 -14,-22 14,-22" />
      <polygon points="0,-34 -18,-6 18,-6" />
      <polygon points="0,-20 -22,6 22,6" />
    </g>
  );
}

interface TentProps {
  x: number;
  y: number;
  scale?: number;
  lit?: boolean;
  wall: string;
  shade: string;
}

function Tent({ x, y, scale = 1, lit, wall, shade }: TentProps) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {lit && <ellipse cx="0" cy="-6" rx="22" ry="14" className="fill-amber-300/25" />}
      <polygon points="0,-30 -30,0 30,0" className={cn(wall, FILL_T)} />
      <polygon points="0,-30 30,0 12,0" className={cn(shade, FILL_T)} />
      <polygon
        points="0,-18 -9,0 9,0"
        className={lit ? "fill-amber-300 dark:fill-amber-400" : "fill-orange-500 dark:fill-orange-600"}
      />
      <line x1="0" y1="-30" x2="0" y2="-36" strokeWidth="2" strokeLinecap="round" className="stroke-orange-800/70" />
    </g>
  );
}

interface CamporeeSceneProps {
  /** Fractional hour of the day, 0–24. */
  hour: number;
  /** Festive garland (camporee in progress). */
  festive?: boolean;
  /** Golden Sabbath rays around the sun. */
  sabbath?: boolean;
  className?: string;
}

export function CamporeeScene({ hour, festive, sabbath, className }: CamporeeSceneProps) {
  const tod = getTimeOfDay(hour);
  const p = PALETTES[tod];
  const night = tod === "noche" || tod === "madrugada";
  const lit = night || tod === "atardecer";
  const orb = getOrb(hour);
  const showRays = sabbath && orb.isSun;
  const orbR = orb.isSun ? (tod === "atardecer" || tod === "amanecer" ? 38 : 32) : 22;

  return (
    <div className={cn("relative overflow-hidden bg-gradient-to-b", p.bg, className)} aria-hidden="true">
      <svg viewBox="0 0 400 210" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 h-full w-full">
        {(night || tod === "atardecer") && (
          <g className="fill-white">
            {STARS.map((s, i) => (
              <circle
                key={`${s.x}-${s.y}`}
                cx={s.x}
                cy={s.y}
                r={s.r}
                opacity={night ? 1 : i % 3 === 0 ? 0.6 : 0}
                style={{ animation: `camp-twinkle 3s ease-in-out ${s.d}s infinite` }}
              />
            ))}
          </g>
        )}

        {showRays && (
          <g
            className="animate-[spin_60s_linear_infinite] stroke-amber-300/60 dark:stroke-amber-400/25"
            style={{ transformOrigin: `${orb.x}px ${orb.y}px` }}
            strokeWidth="6"
            strokeLinecap="round"
          >
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i * Math.PI * 2) / 12;
              return (
                <line
                  key={`ray-${i}`}
                  x1={sceneCoordinate(orb.x + Math.cos(a) * (orbR + 12))}
                  y1={sceneCoordinate(orb.y + Math.sin(a) * (orbR + 12))}
                  x2={sceneCoordinate(orb.x + Math.cos(a) * (orbR + 36))}
                  y2={sceneCoordinate(orb.y + Math.sin(a) * (orbR + 36))}
                />
              );
            })}
          </g>
        )}

        {/* Sun / Moon */}
        <g style={{ transformOrigin: `${orb.x}px ${orb.y}px`, animation: "camp-glow 6s ease-in-out infinite" }}>
          <circle cx={orb.x} cy={orb.y} r={orbR + 18} className={cn(p.glow, FILL_T)} />
        </g>
        <circle cx={orb.x} cy={orb.y} r={orbR} className={cn(p.orb, FILL_T)} />
        {!orb.isSun && (
          <g className="fill-indigo-200/50">
            <circle cx={orb.x - 7} cy={orb.y - 5} r="4" />
            <circle cx={orb.x + 6} cy={orb.y + 6} r="2.6" />
            <circle cx={orb.x + 8} cy={orb.y - 7} r="1.8" />
          </g>
        )}

        {/* Clouds */}
        <g style={{ animation: "camp-float 9s ease-in-out infinite" }} className={cn(p.cloud, FILL_T)}>
          <rect x="150" y="38" width="62" height="14" rx="7" />
          <rect x="166" y="28" width="30" height="16" rx="8" />
        </g>
        <g style={{ animation: "camp-float 12s ease-in-out infinite reverse" }} className={cn(p.cloud, FILL_T)}>
          <rect x="40" y="70" width="48" height="11" rx="5.5" />
        </g>

        <path
          d="M0 120 C 60 92, 110 96, 160 112 S 260 86, 320 104 S 380 100, 400 96 L400 210 L0 210 Z"
          className={cn(p.farHill, FILL_T)}
        />
        <g className={cn(p.farPine, FILL_T)}>
          <Pine x={352} y={106} scale={0.8} />
          <Pine x={378} y={110} scale={0.6} />
        </g>
        <path
          d="M0 146 C 70 120, 130 128, 200 140 S 320 118, 400 134 L400 210 L0 210 Z"
          className={cn(p.midHill, FILL_T)}
        />

        {/* Flag */}
        <line
          x1="292" y1="148" x2="292" y2="92" strokeWidth="2.5" strokeLinecap="round"
          className="stroke-orange-700/80 dark:stroke-orange-300/70"
        />
        <g style={{ transformOrigin: "292px 94px", animation: "camp-flag 2.4s ease-in-out infinite" }}>
          <polygon points="292,92 326,100 292,110" className={cn(p.flag, FILL_T)} />
        </g>

        {festive && (
          <g opacity={night ? 0.7 : 1}>
            <path d="M58 112 Q 176 146, 292 100" fill="none" strokeWidth="1" className="stroke-orange-800/40" />
            {garlandPoints().map((pt, i) => (
              <polygon
                key={`g-${i}`}
                points={`${pt.x - 4},${pt.y} ${pt.x + 4},${pt.y} ${pt.x},${pt.y + 8}`}
                className={GARLAND_COLORS[i % GARLAND_COLORS.length]}
              />
            ))}
          </g>
        )}

        <g className={cn(p.nearPine, FILL_T)}>
          <Pine x={14} y={160} scale={0.9} />
          <Pine x={346} y={156} scale={0.8} />
          <Pine x={378} y={150} scale={1} />
        </g>

        <Tent x={132} y={164} scale={1.1} lit={lit} wall={p.tentWall} shade={p.tentShade} />
        <Tent x={228} y={160} scale={0.85} lit={lit} wall={p.tentWall} shade={p.tentShade} />

        {/* Campfire */}
        <g transform="translate(182 166)">
          {lit && <circle cx="0" cy="-4" r={night ? 22 : 16} className="fill-amber-300/30" />}
          {!night && (
            <g className="fill-stone-400/50 dark:fill-stone-300/30">
              <circle cx="0" cy="-18" r="4" style={{ animation: "camp-smoke 3s ease-out infinite" }} />
              <circle cx="3" cy="-20" r="3" style={{ animation: "camp-smoke 3s ease-out 1s infinite" }} />
              <circle cx="-2" cy="-22" r="3.5" style={{ animation: "camp-smoke 3s ease-out 2s infinite" }} />
            </g>
          )}
          <ellipse cx="0" cy="2" rx="16" ry="3" className="fill-orange-900/20" />
          <path
            d={night ? "M0 -20 C 8 -8, 10 -2, 0 2 C -10 -2, -8 -8, 0 -20 Z" : "M0 -14 C 6 -6, 8 -2, 0 2 C -8 -2, -6 -6, 0 -14 Z"}
            className="fill-orange-500"
          />
          <path d="M0 -7 C 3 -3, 4 -1, 0 2 C -4 -1, -3 -3, 0 -7 Z" className="fill-amber-300" />
          <rect x="-10" y="1" width="20" height="3" rx="1.5" transform="rotate(12)" className="fill-orange-900/70" />
          <rect x="-10" y="1" width="20" height="3" rx="1.5" transform="rotate(-12)" className="fill-orange-900/70" />
        </g>

        <path
          d="M0 176 C 90 160, 170 170, 240 172 S 350 160, 400 168 L400 210 L0 210 Z"
          className={cn(p.front, FILL_T)}
        />

        {night && (
          <g className="fill-amber-200">
            {FIREFLIES.map((f) => (
              <circle
                key={`ff-${f.x}`}
                cx={f.x}
                cy={f.y}
                r="1.6"
                style={{ animation: `camp-twinkle 2.4s ease-in-out ${f.d}s infinite` }}
              />
            ))}
          </g>
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent" />
    </div>
  );
}
