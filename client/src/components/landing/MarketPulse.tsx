import { useEffect, useRef, useCallback } from "react";

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
    const ctx = c;

    const GOLD = "rgba(255, 214, 10,";
    const baseY = H * 0.52;

    const traceLength = W * 1.2;
    let headX = -50;
    const speed = W * 0.0025;

    function ecgShape(x: number): number {
      const cycle = 280;
      const pos = ((x % cycle) + cycle) % cycle;

      if (pos < 60) return Math.sin((pos / 60) * Math.PI * 2) * 2;
      if (pos < 80) return 0;

      if (pos < 90) return ((pos - 80) / 10) * -12;
      if (pos < 95) return -12 + ((pos - 90) / 5) * 60;
      if (pos < 100) return 48 - ((pos - 95) / 5) * 58;
      if (pos < 105) return -10 + ((pos - 100) / 5) * 10;

      if (pos < 130) return 0;
      if (pos < 155) {
        const t = (pos - 130) / 25;
        return Math.sin(t * Math.PI) * 8;
      }
      if (pos < 200) return Math.sin((pos - 155) / 45 * Math.PI) * 1.5;
      return 0;
    }

    const spikeStart = W * 0.38;
    const spikeEnd = W * 0.62;
    const spikePeak = W * 0.50;

    function bigSpike(x: number): number {
      if (x < spikeStart || x > spikeEnd) return 0;
      if (x <= spikePeak) {
        const t = (x - spikeStart) / (spikePeak - spikeStart);
        return Math.pow(t, 2.5) * 180;
      } else {
        const t = (x - spikePeak) / (spikeEnd - spikePeak);
        return (1 - Math.pow(t, 1.5)) * 180;
      }
    }

    function animate() {
      ctx.clearRect(0, 0, W, H);

      ctx.strokeStyle = `${GOLD} 0.04)`;
      ctx.lineWidth = 0.5;
      const gridSpacing = 50;
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

      headX += speed;
      if (headX > W + traceLength * 0.3) {
        headX = -50;
      }

      const tailX = headX - traceLength;

      ctx.beginPath();
      ctx.strokeStyle = `${GOLD} 0.7)`;
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(255, 214, 10, 0.5)";
      ctx.shadowBlur = 8;

      let started = false;
      const step = 2;
      for (let px = Math.max(0, tailX); px <= Math.min(W, headX); px += step) {
        const distFromHead = headX - px;
        const fadeIn = distFromHead < 30 ? distFromHead / 30 : 1;
        const fadeOut = (px - tailX) / (traceLength * 0.3);
        const alpha = Math.min(fadeIn, Math.min(fadeOut, 1));

        if (alpha <= 0) continue;

        const ecg = ecgShape(px) * 1.2;
        const spike = bigSpike(px);
        const y = baseY - ecg - spike;

        if (!started) {
          ctx.moveTo(px, y);
          started = true;
        } else {
          ctx.lineTo(px, y);
        }
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.strokeStyle = `${GOLD} 0.15)`;
      ctx.lineWidth = 1;
      for (let px = Math.max(0, tailX); px <= Math.min(W, headX); px += step) {
        const distFromHead = headX - px;
        const fadeIn = distFromHead < 30 ? distFromHead / 30 : 1;
        const fadeOut = (px - tailX) / (traceLength * 0.3);
        const alpha = Math.min(fadeIn, Math.min(fadeOut, 1));
        if (alpha <= 0) continue;

        const ecg = ecgShape(px + 40) * 0.8;
        const spike = bigSpike(px) * 0.6;
        const y = baseY + 30 - ecg * 0.5 - spike * 0.4;

        if (px === Math.max(0, Math.floor(tailX / step) * step)) {
          ctx.moveTo(px, y);
        } else {
          ctx.lineTo(px, y);
        }
      }
      ctx.stroke();

      if (headX > 0 && headX < W) {
        const ecgHead = ecgShape(headX) * 1.2;
        const spikeHead = bigSpike(headX);
        const dotY = baseY - ecgHead - spikeHead;
        const dotGlow = ctx.createRadialGradient(headX, dotY, 0, headX, dotY, 20);
        dotGlow.addColorStop(0, `${GOLD} 0.8)`);
        dotGlow.addColorStop(0.5, `${GOLD} 0.2)`);
        dotGlow.addColorStop(1, `${GOLD} 0)`);
        ctx.fillStyle = dotGlow;
        ctx.fillRect(headX - 20, dotY - 20, 40, 40);

        ctx.beginPath();
        ctx.arc(headX, dotY, 3, 0, Math.PI * 2);
        ctx.fillStyle = `${GOLD} 1)`;
        ctx.fill();
      }

      if (headX >= spikeStart && headX <= spikeEnd + 100) {
        const glowIntensity = headX <= spikePeak
          ? (headX - spikeStart) / (spikePeak - spikeStart)
          : Math.max(0, 1 - (headX - spikePeak) / (spikeEnd + 100 - spikePeak));
        const gx = spikePeak;
        const gy = baseY - 120;
        const gr = 150 + glowIntensity * 80;
        const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
        glow.addColorStop(0, `${GOLD} ${0.08 * glowIntensity})`);
        glow.addColorStop(1, `${GOLD} 0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
      }

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
