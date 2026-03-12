import type { RefObject } from 'react';

interface CelebrationLayerProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  championName: string | null;
}

export function CelebrationLayer({
  canvasRef,
  championName,
}: CelebrationLayerProps) {
  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 9999,
        }}
      />
      <div
        style={{
          display: championName ? 'flex' : 'none',
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          pointerEvents: 'none',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            fontSize: 'clamp(2rem,8vw,5rem)',
            fontWeight: 900,
            color: '#fff',
            textShadow: '0 0 40px #f5a623,0 4px 24px rgba(0,0,0,0.5)',
            letterSpacing: '-0.02em',
            textAlign: 'center',
            opacity: championName ? 1 : 0,
            transform: `scale(${championName ? 1 : 0.5})`,
            transition: 'opacity 0.35s ease, transform 0.45s cubic-bezier(0.34,1.56,0.64,1)',
          }}
        >
          {championName ? `TROPHY ${championName}` : ''}
        </div>
      </div>
    </>
  );
}
