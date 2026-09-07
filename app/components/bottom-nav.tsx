'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, Home, MoreHorizontal } from "lucide-react";
import "../nav.css";

const items = [
  ["/", "Inicio", Home],
  ["/program", "Programa", CalendarDays],
  ["/tasks", "Tareas", CheckCircle2],
  ["/more", "Más", MoreHorizontal],
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    for (const [href] of items) router.prefetch(href);
  }, [router]);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  return <nav className="nav nav-four" aria-label="Navegación principal">{items.map(([href,label,Icon]) => {
    const routeActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
    const active = pendingHref ? pendingHref === href : routeActive;
    return <Link
      prefetch
      className={active ? "active" : ""}
      href={href}
      key={href}
      aria-current={routeActive ? "page" : undefined}
      onPointerDown={() => setPendingHref(href)}
      onClick={() => setPendingHref(href)}
    ><span className="nav-icon"><Icon size={22} strokeWidth={2.2}/></span><span className="nav-label">{label}</span></Link>;
  })}</nav>;
}
