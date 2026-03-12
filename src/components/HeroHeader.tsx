import type { ViewMode } from '../types';

interface HeroHeaderProps {
  currentView: ViewMode;
  shareStatus: string;
  onShare: () => void;
  onViewChange: (view: ViewMode) => void;
}

export function HeroHeader({
  currentView,
  shareStatus,
  onShare,
  onViewChange,
}: HeroHeaderProps) {
  return (
    <header className="hero">
      <div className="brand-row">
        <div className="brand-wordmark" aria-label="RoomingKos">
          RoomingKos
        </div>
      </div>
      <h1>Swanston Table Tennis Tournament</h1>
      <p className="subtitle">
        Single-elimination bracket (16 entrants). Player slots are displayed at the bottom and
        the champion position is connected upward.
      </p>
      <div className="mode-switch" role="tablist" aria-label="View mode">
        <button
          type="button"
          className={`mode-tab${currentView === 'warriors' ? ' active' : ''}`}
          role="tab"
          aria-pressed={currentView === 'warriors'}
          onClick={() => onViewChange('warriors')}
        >
          Warriors
        </button>
        <button
          type="button"
          className={`mode-tab${currentView === 'admin' ? ' active' : ''}`}
          role="tab"
          aria-pressed={currentView === 'admin'}
          onClick={() => onViewChange('admin')}
        >
          Admin
        </button>
      </div>
      <div className="hero-cta">
        <button type="button" onClick={onShare}>
          Share This Event
        </button>
        <p className="share-status" aria-live="polite">
          {shareStatus}
        </p>
      </div>
    </header>
  );
}
