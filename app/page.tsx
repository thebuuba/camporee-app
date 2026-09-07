const quick = [["✓","Tarea"],["📝","Apunte"],["💰","Gasto"],["🛒","Compra"]];

export default function Home() {
  return <main className="app">
    <header className="top"><div><div className="eyebrow">CAMPOREE</div><h1>¡Vamos a prepararnos! ⛺</h1></div><div className="avatar">C</div></header>
    <section className="hero"><small>PRÓXIMO CAMPOREE</small><h2>Todo bajo control, desde la salida hasta el regreso.</h2><div className="countdown"><span>— días</span><span>Modo preparación</span></div><div className="progress-label"><span>Preparación general</span><b>0%</b></div><div className="bar"><i /></div></section>
    <section className="grid"><article className="stat"><small>Tareas pendientes</small><b>0</b></article><article className="stat"><small>Compras pendientes</small><b>0</b></article><article className="stat"><small>Participantes</small><b>0</b></article><article className="stat"><small>Gastos</small><b>RD$0</b></article></section>
    <div className="section-head"><h3>Agregar rápido</h3><span>Lo que necesites</span></div><section className="actions">{quick.map(([icon,label])=><button className="action" key={label}><span className="ico">{icon}</span><small>{label}</small></button>)}</section>
    <div className="section-head"><h3>Para hoy</h3><span>Ver todas</span></div><div className="empty">Todavía no hay tareas. Crea el camporee y empieza a organizarlo.</div>
    <nav className="nav" aria-label="Navegación principal"><button className="active"><span>⌂</span>Inicio</button><button><span>▣</span>Programa</button><button className="plus" aria-label="Agregar">+</button><button><span>✓</span>Tareas</button><button><span>•••</span>Más</button></nav>
  </main>;
}