import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return <main className="app route-loading">
    <div className="loading-shell ios-card">
      <span className="loading-icon"><LoaderCircle size={24}/></span>
      <div><strong>Cargando panel…</strong><small>Un momento.</small></div>
    </div>
  </main>;
}
