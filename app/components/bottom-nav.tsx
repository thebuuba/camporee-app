import Link from "next/link";

export default function BottomNav() {
  return <nav className="nav nav-four"><Link href="/">Inicio</Link><Link href="/program">Programa</Link><Link href="/tasks">Tareas</Link><Link href="/more">Más</Link></nav>;
}
