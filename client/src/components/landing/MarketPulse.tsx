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

    let animationId: number;
    let w = 0;
    let h = 0;

    const gridX: Float32Array[] = [];
    const gridY: Float32Array[] = [];
    let cols = 0;
    let rows = 0;

    const freeX: Float32Array = new Float32Array(60);
    const freeY: Float32Array = new Float32Array(60);
    const freeVX: Float32Array = new Float32Array(60);
    const freeVY: Float32Array = new Float32Array(60);
    const FREE_COUNT = 60;
    const LINE_DIST = 50;
    const LINE_DIST_SQ = LINE_DIST * LINE_DIST;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      if (w === 0 || h === 0) return;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const spacing = 30;
      cols = Math.ceil(w / spacing);
      rows = Math.ceil(h / spacing);

      gridX.length = 0;
      gridY.length = 0;
      for (let i = 0; i < cols; i++) {
        const colX = new Float32Array(rows);
        const colY = new Float32Array(rows);
        for (let j = 0; j < rows; j++) {
          colX[j] = (i + 0.5) * spacing;
          colY[j] = (j + 0.5) * spacing;
        }
        gridX.push(colX);
        gridY.push(colY);
      }

      for (let i = 0; i < FREE_COUNT; i++) {
        freeX[i] = w * 0.5 + Math.random() * w * 0.5;
        freeY[i] = Math.random() * h;
        freeVX[i] = (Math.random() - 0.5) * 3;
        freeVY[i] = (Math.random() - 0.5) * 3;
      }
    }

    resize();

    function animate() {
      if (!ctx || w === 0) {
        animationId = requestAnimationFrame(animate);
        return;
      }

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < FREE_COUNT; i++) {
        freeVX[i] += (Math.random() - 0.5) * 1.5;
        freeVY[i] += (Math.random() - 0.5) * 1.5;
        freeVX[i] *= 0.92;
        freeVY[i] *= 0.92;
        freeX[i] += freeVX[i];
        freeY[i] += freeVY[i];

        if (freeX[i] < w * 0.5) { freeX[i] = w * 0.5; freeVX[i] *= -1; }
        if (freeX[i] > w) { freeX[i] = w; freeVX[i] *= -1; }
        if (freeY[i] < 0) { freeY[i] = 0; freeVY[i] *= -1; }
        if (freeY[i] > h) { freeY[i] = h; freeVY[i] *= -1; }
      }

      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      const halfCols = Math.floor(cols / 2);
      for (let i = 0; i < halfCols; i++) {
        const cx = gridX[i];
        const cy = gridY[i];
        for (let j = 0; j < rows; j++) {
          ctx.moveTo(cx[j] + 1.5, cy[j]);
          ctx.arc(cx[j], cy[j], 1.5, 0, 6.2832);
        }
      }
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.30)";
      ctx.beginPath();
      for (let i = 0; i < FREE_COUNT; i++) {
        ctx.moveTo(freeX[i] + 1.5, freeY[i]);
        ctx.arc(freeX[i], freeY[i], 1.5, 0, 6.2832);
      }
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();

      for (let i = 0; i < FREE_COUNT; i++) {
        const fx = freeX[i];
        const fy = freeY[i];

        for (let k = i + 1; k < FREE_COUNT; k++) {
          const dx = fx - freeX[k];
          const dy = fy - freeY[k];
          if (dx * dx + dy * dy < LINE_DIST_SQ) {
            ctx.moveTo(fx, fy);
            ctx.lineTo(freeX[k], freeY[k]);
          }
        }

        const startCol = Math.max(0, Math.floor((fx - LINE_DIST) / (w / cols)));
        const endCol = Math.min(halfCols - 1, Math.floor((fx + LINE_DIST) / (w / cols)));
        const startRow = Math.max(0, Math.floor((fy - LINE_DIST) / (h / rows)));
        const endRow = Math.min(rows - 1, Math.floor((fy + LINE_DIST) / (h / rows)));

        for (let ci = startCol; ci <= endCol; ci++) {
          const cx = gridX[ci];
          const cy = gridY[ci];
          for (let ri = startRow; ri <= endRow; ri++) {
            const dx = fx - cx[ri];
            const dy = fy - cy[ri];
            if (dx * dx + dy * dy < LINE_DIST_SQ) {
              ctx.moveTo(fx, fy);
              ctx.lineTo(cx[ri], cy[ri]);
            }
          }
        }
      }

      ctx.stroke();

      const midX = w / 2;
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, h);
      ctx.stroke();

      animationId = requestAnimationFrame(animate);
    }

    animationId = requestAnimationFrame(animate);

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
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
