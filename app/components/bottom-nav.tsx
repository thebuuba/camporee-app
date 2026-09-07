'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  return <nav className="nav nav-four" aria-label="Navegación principal">{items.map(([href,label,Icon]) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return <Link prefetch={false} className={active ? "active" : ""} href={href} key={href}><Icon size={22} strokeWidth={2.2}/><span>{label}</span></Link>;
  })}</nav>;
}
