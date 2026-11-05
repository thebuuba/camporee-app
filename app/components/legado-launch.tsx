import './legado-launch.css';

/** The emblem belongs to the app's loading surface, not a timed event intro. */
export default function LegadoLaunch({ ready = false }: { ready?: boolean }) {
  return <div className={`legado-launch${ready ? ' legado-launch-ready' : ''}`} role="status" aria-label="Cargando el camporee Legado">
    <div className="legado-launch-content">
      <div className="legado-launch-stage" aria-hidden="true">
        <div className="legado-launch-halo"/>
        <div className="legado-launch-emblem">
          <img src="/legado-emblem-v1.png" width="432" height="422" alt="" fetchPriority="high"/>
          <span className="legado-launch-shine"/>
          <span className="legado-launch-torch"/>
        </div>
      </div>
      <div className="legado-launch-loading">
        <span aria-hidden="true"/>
        <small className="legado-launch-waiting">Preparando tu camporee…</small>
        <small className="legado-launch-done">Todo listo</small>
      </div>
    </div>
  </div>;
}
