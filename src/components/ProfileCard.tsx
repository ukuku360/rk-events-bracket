import type { RefObject } from 'react';
import type { ProfileCardData } from '../types';

interface ProfileCardProps {
  cardRef: RefObject<HTMLDivElement | null>;
  data: ProfileCardData | null;
  visible: boolean;
  pinned: boolean;
  left: number;
  top: number;
}

export function ProfileCard({
  cardRef,
  data,
  visible,
  pinned,
  left,
  top,
}: ProfileCardProps) {
  return (
    <div
      ref={cardRef}
      className={`player-profile-card${visible ? ' visible' : ''}${pinned ? ' pinned' : ''}`}
      aria-hidden={visible ? 'false' : 'true'}
      style={{ left, top }}
    >
      <p className="player-profile-kicker">Bracket Intel</p>
      <h3 className="player-profile-name">{data?.name || 'Player'}</h3>
      <p className="player-profile-meta">{data?.metaLabel || 'Slot 1'}</p>
      <div className="player-profile-grid">
        <div className="player-profile-block aura">
          <span className="player-profile-label">Aura Skill</span>
          <p className="player-profile-value">{data?.aura || 'No aura listed yet.'}</p>
        </div>
        <div className="player-profile-block weak">
          <span className="player-profile-label">Weak Point</span>
          <p className="player-profile-value">{data?.weak || 'No weak point listed yet.'}</p>
        </div>
      </div>
    </div>
  );
}
