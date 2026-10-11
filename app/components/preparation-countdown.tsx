"use client";

import { useEffect, useState } from "react";
import { camporeeMidnightEpoch } from "@/lib/camporee-locale";

export default function PreparationCountdown({ startsOn, initialNow, timeZone='America/Santo_Domingo' }: { startsOn: string; initialNow: number; timeZone?:string }) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [startsOn,timeZone]);
  const remaining = Math.max(0,Math.floor((camporeeMidnightEpoch(startsOn,timeZone)-now)/60000));
  const countdown = {days:Math.floor(remaining/1440),hours:Math.floor(remaining/60)%24,minutes:remaining%60};
  return <div className="preparation-countdown" aria-label="Tiempo hasta el camporee">{[[countdown.days, "días"], [countdown.hours, "horas"], [countdown.minutes, "min"]].map(([value, label]) => <div key={label}><strong>{String(value).padStart(2, "0")}</strong><span>{label}</span></div>)}</div>;
}
