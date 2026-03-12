import { useCallback, useEffect, useRef, useState } from 'react';

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  rotSpeed: number;
  life: number;
  decay: number;
  gravity: number;
  shape: 'rect' | 'star';
  aspect: number;
}

const COLORS = ['#de1f4a', '#ff6b8a', '#4caf50', '#f5a623', '#2196f3', '#9c27b0', '#00e5ff', '#ffeb3b', '#ff9800'];

export function useCelebration() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<ConfettiParticle[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const timeoutIdsRef = useRef<number[]>([]);
  const [championName, setChampionName] = useState<string | null>(null);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }, []);

  const drawStar = useCallback((
    context: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    spikes: number,
    outerRadius: number,
    innerRadius: number,
  ) => {
    let rotation = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;

    context.beginPath();
    context.moveTo(cx, cy - outerRadius);

    for (let index = 0; index < spikes; index += 1) {
      context.lineTo(cx + Math.cos(rotation) * outerRadius, cy + Math.sin(rotation) * outerRadius);
      rotation += step;
      context.lineTo(cx + Math.cos(rotation) * innerRadius, cy + Math.sin(rotation) * innerRadius);
      rotation += step;
    }

    context.lineTo(cx, cy - outerRadius);
    context.closePath();
    context.fill();
  }, []);

  const tick = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!canvas || !context) {
      animationFrameRef.current = null;
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    particlesRef.current = particlesRef.current.filter((particle) => particle.life > 0);

    for (const particle of particlesRef.current) {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += particle.gravity;
      particle.vx *= 0.985;
      particle.rotation += particle.rotSpeed;
      particle.life -= particle.decay;

      context.save();
      context.globalAlpha = Math.max(0, particle.life);
      context.translate(particle.x, particle.y);
      context.rotate(particle.rotation);
      context.fillStyle = particle.color;

      if (particle.shape === 'star') {
        drawStar(context, 0, 0, 5, particle.size, particle.size * 0.4);
      } else {
        context.fillRect(
          -particle.size / 2,
          -(particle.size * particle.aspect) / 2,
          particle.size,
          particle.size * particle.aspect,
        );
      }

      context.restore();
    }

    if (particlesRef.current.length > 0) {
      animationFrameRef.current = requestAnimationFrame(tick);
      return;
    }

    animationFrameRef.current = null;
    context.clearRect(0, 0, canvas.width, canvas.height);
  }, [drawStar]);

  const ensureAnimationRunning = useCallback(() => {
    if (animationFrameRef.current) {
      return;
    }

    animationFrameRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const spawnBurst = useCallback((
    x: number,
    y: number,
    count: number,
    speed: number,
    gravity: number,
    decay: number,
    big: boolean,
  ) => {
    const nextParticles: ConfettiParticle[] = [];

    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (0.4 + Math.random() * 0.6);

      nextParticles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - speed * 0.6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: big ? 5 + Math.random() * 9 : 3 + Math.random() * 4,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.25,
        life: 1,
        decay,
        gravity,
        shape: big && Math.random() > 0.55 ? 'star' : 'rect',
        aspect: 0.4 + Math.random() * 0.35,
      });
    }

    particlesRef.current.push(...nextParticles);
  }, []);

  const triggerWinnerConfetti = useCallback((clientX?: number, clientY?: number) => {
    const x = clientX ?? window.innerWidth / 2;
    const y = clientY ?? window.innerHeight / 2;

    spawnBurst(x, y, 40, 7, 0.28, 0.018, false);
    ensureAnimationRunning();
  }, [ensureAnimationRunning, spawnBurst]);

  const triggerChampionCelebration = useCallback((name: string) => {
    timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutIdsRef.current = [];

    const canvas = canvasRef.current;
    const width = canvas?.width ?? window.innerWidth;
    const height = canvas?.height ?? window.innerHeight;

    const wave = (delay: number, positions: Array<[number, number]>) => {
      const timeoutId = window.setTimeout(() => {
        positions.forEach(([x, y]) => {
          spawnBurst(x, y, 80, 15, 0.22, 0.007, true);
        });
        ensureAnimationRunning();
      }, delay);

      timeoutIdsRef.current.push(timeoutId);
    };

    wave(0, [[width * 0.5, height * 0.45]]);
    wave(180, [[width * 0.2, height * 0.5], [width * 0.8, height * 0.5]]);
    wave(380, [[width * 0.1, height * 0.6], [width * 0.9, height * 0.6], [width * 0.5, height * 0.3]]);
    wave(580, [[width * 0.35, height * 0.55], [width * 0.65, height * 0.55]]);
    wave(820, [[width * 0.5, height * 0.5]]);

    setChampionName(name);

    const hideTimeoutId = window.setTimeout(() => {
      setChampionName(null);
    }, 2800);

    timeoutIdsRef.current.push(hideTimeoutId);
  }, [ensureAnimationRunning, spawnBurst]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [resizeCanvas]);

  return {
    canvasRef,
    championName,
    triggerWinnerConfetti,
    triggerChampionCelebration,
  };
}
