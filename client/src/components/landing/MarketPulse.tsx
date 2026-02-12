import { useEffect, useRef, useCallback } from "react";
import { createNoise2D } from "simplex-noise";

interface MarketPulseProps {
  className?: string;
}

export function MarketPulse({ className = "" }: MarketPulseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c = canvas.getContext("2d");
    if (!c) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    c.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const noise2D = createNoise2D();
    let time = 0;

    const LINES = [
      { color: "rgba(34, 197, 94, 0.35)", width: 2.5, offset: 0, amp: 0.18 },
      { color: "rgba(34, 197, 94, 0.15)", width: 1.5, offset: 1.5, amp: 0.14 },
      { color: "rgba(239, 68, 68, 0.25)", width: 2, offset: 3, amp: 0.16 },
      { color: "rgba(239, 68, 68, 0.1)", width: 1, offset: 4.5, amp: 0.12 },
      { color: "rgba(255, 255, 255, 0.06)", width: 1, offset: 6, amp: 0.1 },
    ];

    const spikeCenter = 0.62;
    const spikeWidth = 0.06;
    const spikeAmplitude = 0.28;

    function spikeEnvelope(x: number, t: number): number {
      const pulse = Math.sin(t * 0.4) * 0.5 + 0.5;
      const center = spikeCenter + Math.sin(t * 0.15) * 0.03;
      const dist = Math.abs(x - center);
      if (dist > spikeWidth) return 0;
      const normalized = 1 - dist / spikeWidth;
      return Math.pow(normalized, 3) * spikeAmplitude * (0.6 + pulse * 0.4);
    }

    const ctx = c;

    function animate() {
      ctx.clearRect(0, 0, W, H);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
      ctx.lineWidth = 0.5;
      const gridSpacing = 60;
      for (let x = 0; x < W; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      for (const line of LINES) {
        ctx.beginPath();
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.width;

        const baseY = H * 0.5;
        const step = 3;

        for (let px = 0; px <= W; px += step) {
          const xNorm = px / W;
          const n = noise2D(xNorm * 3 + line.offset, time * 0.6 + line.offset);
          const wave = Math.sin(xNorm * Math.PI * 4 + time * 0.8 + line.offset) * 0.3;
          const spike = spikeEnvelope(xNorm, time);
          const combined = (n * 0.7 + wave) * line.amp + spike;

          const y = baseY - combined * H;

          if (px === 0) {
            ctx.moveTo(px, y);
          } else {
            ctx.lineTo(px, y);
          }
        }
        ctx.stroke();
      }

      const glowX = (spikeCenter + Math.sin(time * 0.15) * 0.03) * W;
      const glowY = H * 0.35;
      const pulse = Math.sin(time * 0.4) * 0.5 + 0.5;
      const glowRadius = 120 + pulse * 60;
      const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowRadius);
      glow.addColorStop(0, `rgba(34, 197, 94, ${0.06 + pulse * 0.04})`);
      glow.addColorStop(1, "rgba(34, 197, 94, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      time += 0.012;
      animRef.current = requestAnimationFrame(animate);
    }

    animate();
  }, []);

  useEffect(() => {
    draw();

    const handleResize = () => {
      cancelAnimationFrame(animRef.current);
      draw();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", handleResize);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${className}`}
      style={{ background: "transparent" }}
      data-testid="canvas-market-pulse"
    />
  );
}
