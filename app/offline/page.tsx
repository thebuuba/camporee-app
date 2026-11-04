import OfflineDashboard from './offline-dashboard';

export default function OfflinePage() {
  return <main className="app panel-page offline-page">
    <header className="polymet-panel-heading"><h1>Seguimos en campamento</h1><p>Sin conexión · Consulta la copia preparada en este dispositivo.</p></header>
    <OfflineDashboard/>
  </main>;
}
