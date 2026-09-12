export default function MorePanelLoading(){
  return <main className="app panel-route-loading" aria-live="polite" aria-busy="true">
    <div className="panel-route-loading-head"><span className="panel-route-loading-back"/><div><span className="panel-route-loading-line short"/><span className="panel-route-loading-line title"/></div></div>
    <div className="panel-route-loading-block"/>
    <div className="panel-route-loading-block tall"/>
    <div className="panel-route-loading-block"/>
    <div className="panel-route-loading-copy">Cargando panel…</div>
  </main>;
}
