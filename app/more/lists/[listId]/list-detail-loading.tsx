import { ChevronLeft } from 'lucide-react';

// Keeps the screen responsive while the protected list query finishes.
export default function ListDetailLoading() {
  return <main className="app panel-page polymet-panel polymet-list-detail-page pm-list-loading" aria-busy="true">
    <header className="subpage-top">
      <span className="back-btn" aria-hidden="true"><ChevronLeft size={21} /></span>
      <div className="pm-list-loading-title">
        <span className="pm-list-loading-line pm-list-loading-heading" />
        <span className="pm-list-loading-line pm-list-loading-subtitle" />
      </div>
    </header>
    <div className="pm-list-loading-summary" aria-hidden="true">
      <span className="pm-list-loading-line pm-list-loading-heading" />
      <span className="pm-list-loading-line pm-list-loading-subtitle" />
      <span className="pm-list-loading-line pm-list-loading-track" />
    </div>
    <div className="pm-list-loading-section" aria-hidden="true">
      <span className="pm-list-loading-line pm-list-loading-heading" />
      <div className="pm-list-loading-card" />
      <div className="pm-list-loading-card" />
    </div>
    <span className="pm-list-loading-text" role="status">Abriendo lista…</span>
  </main>;
}
