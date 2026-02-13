import { useEffect, useRef } from "react";

interface MarketPulseProps {
  className?: string;
}

export function MarketPulse({ className = "" }: MarketPulseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animationId = 0;
    let w = 0;
    let h = 0;
    let count = 0;
    let visible = true;
    let px: Float32Array;
    let py: Float32Array;
    let vx: Float32Array;
    let vy: Float32Array;
    let ox: Float32Array;
    let oy: Float32Array;
    let ordered: Uint8Array;

    const LINE_DIST = 47;
    const LINE_DIST_SQ = LINE_DIST * LINE_DIST;

    function setup() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      if (w === 0 || h === 0) return;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const spacing = 32;
      const cols = Math.max(8, Math.round(w / spacing));
      const rows = Math.max(5, Math.round(h / spacing));
      count = cols * rows;

      px = new Float32Array(count);
      py = new Float32Array(count);
      vx = new Float32Array(count);
      vy = new Float32Array(count);
      ox = new Float32Array(count);
      oy = new Float32Array(count);
      ordered = new Uint8Array(count);

      const sx = w / cols;
      const sy = h / rows;
      let idx = 0;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = sx * i + sx / 2;
          const y = sy * j + sy / 2;
          px[idx] = x;
          py[idx] = y;
          ox[idx] = x;
          oy[idx] = y;
          vx[idx] = (Math.random() - 0.5) * 2;
          vy[idx] = (Math.random() - 0.5) * 2;
          ordered[idx] = x < w / 2 ? 1 : 0;
          idx++;
        }
      }
    }

    setup();

    const CELL = 50;
    let gridW = 0;
    let gridH = 0;
    let cellHeads: Int32Array;
    let cellNext: Int32Array;

    function buildGrid() {
      gridW = Math.ceil(w / CELL) + 1;
      gridH = Math.ceil(h / CELL) + 1;
      const totalCells = gridW * gridH;
      if (!cellHeads || cellHeads.length < totalCells) {
        cellHeads = new Int32Array(totalCells);
      }
      if (!cellNext || cellNext.length < count) {
        cellNext = new Int32Array(count);
      }
      cellHeads.fill(-1);
      for (let i = 0; i < count; i++) {
        const cx = Math.min(gridW - 1, Math.max(0, (px[i] / CELL) | 0));
        const cy = Math.min(gridH - 1, Math.max(0, (py[i] / CELL) | 0));
        const ci = cy * gridW + cx;
        cellNext[i] = cellHeads[ci];
        cellHeads[ci] = i;
      }
    }

    let frame = 0;
    let lastTime = 0;
    const halfW = () => w * 0.5;

    function animate(now: number) {
      if (!ctx || w === 0) {
        animationId = requestAnimationFrame(animate);
        return;
      }

      if (!visible) {
        lastTime = now;
        animationId = requestAnimationFrame(animate);
        return;
      }

      if (lastTime && now - lastTime < 14) {
        animationId = requestAnimationFrame(animate);
        return;
      }
      lastTime = now;

      ctx.clearRect(0, 0, w, h);

      const hw = halfW();
      for (let i = 0; i < count; i++) {
        if (ordered[i]) {
          px[i] += (ox[i] - px[i]) * 0.08;
          py[i] += (oy[i] - py[i]) * 0.08;
        } else {
          vx[i] += (Math.random() - 0.5) * 2.0;
          vy[i] += (Math.random() - 0.5) * 2.0;
          vx[i] *= 0.91;
          vy[i] *= 0.91;
          px[i] += vx[i];
          py[i] += vy[i];

          if (px[i] < hw) { px[i] = hw; vx[i] *= -1; }
          if (px[i] > w) { px[i] = w; vx[i] *= -1; }
          if (py[i] < 0) { py[i] = 0; vy[i] *= -1; }
          if (py[i] > h) { py[i] = h; vy[i] *= -1; }
        }
      }

      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        if (ordered[i]) {
          ctx.moveTo(px[i] + 2, py[i]);
          ctx.arc(px[i], py[i], 2, 0, 6.2832);
        }
      }
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        if (!ordered[i]) {
          ctx.moveTo(px[i] + 2, py[i]);
          ctx.arc(px[i], py[i], 2, 0, 6.2832);
        }
      }
      ctx.fill();

      if (frame % 3 === 0) {
        buildGrid();
      }
      frame++;

      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();

      for (let i = 0; i < count; i++) {
        const x1 = px[i];
        const y1 = py[i];
        const cx = (x1 / CELL) | 0;
        const cy = (y1 / CELL) | 0;

        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          if (nx < 0 || nx >= gridW) continue;
          for (let dy = -1; dy <= 1; dy++) {
            const ny = cy + dy;
            if (ny < 0 || ny >= gridH) continue;
            let j = cellHeads[ny * gridW + nx];
            while (j !== -1) {
              if (j > i) {
                const ddx = x1 - px[j];
                const ddy = y1 - py[j];
                if (ddx * ddx + ddy * ddy < LINE_DIST_SQ) {
                  ctx.moveTo(x1, y1);
                  ctx.lineTo(px[j], py[j]);
                }
              }
              j = cellNext[j];
            }
          }
        }
      }
      ctx.stroke();

      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(hw, 0);
      ctx.lineTo(hw, h);
      ctx.stroke();

      animationId = requestAnimationFrame(animate);
    }

    animationId = requestAnimationFrame(animate);

    const observer = new IntersectionObserver(
      ([entry]) => { visible = entry.isIntersecting; },
      { threshold: 0 }
    );
    observer.observe(canvas);

    const handleResize = () => {
      cancelAnimationFrame(animationId);
      setup();
      animationId = requestAnimationFrame(animate);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(animationId);
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${className}`}
      style={{ background: "transparent" }}
      data-testid="canvas-market-pulse"
    />
  );
}
