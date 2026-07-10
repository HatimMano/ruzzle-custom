import { useEffect, useRef } from "react";

const COLORS = ["#fbbf24", "#f472b6", "#60a5fa", "#34d399", "#a78bfa", "#f87171"];

interface Particle {
  x: number;
  y: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vrot: number;
  color: string;
}

// Confettis performants : 1 canvas + 1 boucle rAF (aucun layout/compositing DOM).
// Remplit son conteneur parent (position absolute inset 0).
export default function ConfettiCanvas({ count = 18 }: { count?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: rand(0, 1),
      y: rand(-1, 0),
      vy: rand(55, 110),      // px/s
      w: rand(5, 10),
      h: rand(2.5, 4.5),
      rot: rand(0, Math.PI * 2),
      vrot: rand(-3, 3),      // rad/s
      color: COLORS[Math.floor(rand(0, COLORS.length))],
    }));

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.y += (p.vy * dt) / Math.max(height, 1);
        p.rot += p.vrot * dt;
        if (p.y > 1.05) {
          p.y = -0.05;
          p.x = Math.random();
        }
        ctx.save();
        ctx.translate(p.x * width, p.y * height);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [count]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}
