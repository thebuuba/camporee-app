"use client";

import { useEffect, useState } from "react";
import { preparationCountdown } from "@/lib/camporee-preparation";

export default function PreparationCountdown({ startsOn, initialNow }: { startsOn: string; initialNow: number }) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [startsOn]);
  const countdown = preparationCountdown(startsOn, now);
  return <div className="preparation-countdown" aria-label="Tiempo hasta el camporee">{[[countdown.days, "días"], [countdown.hours, "horas"], [countdown.minutes, "min"]].map(([value, label]) => <div key={label}><strong>{String(value).padStart(2, "0")}</strong><span>{label}</span></div>)}</div>;
}
