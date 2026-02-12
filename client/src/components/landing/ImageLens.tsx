import { useState, useRef, useCallback } from "react";

interface ImageLensProps {
  src: string;
  alt: string;
  className?: string;
  lensSize?: number;
  zoom?: number;
  "data-testid"?: string;
}

export function ImageLens({
  src,
  alt,
  className = "",
  lensSize = 220,
  zoom = 1.8,
  ...props
}: ImageLensProps) {
  const [hovering, setHovering] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      setPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    []
  );

  const half = lensSize / 2;
  const cw = containerRef.current?.offsetWidth ?? 1;
  const ch = containerRef.current?.offsetHeight ?? 1;

  const bgW = cw * zoom;
  const bgH = ch * zoom;

  let bgX = -(pos.x * zoom - half);
  let bgY = -(pos.y * zoom - half);

  const minBgX = lensSize - bgW;
  const minBgY = lensSize - bgH;
  if (bgX > 0) bgX = 0;
  if (bgY > 0) bgY = 0;
  if (bgX < minBgX) bgX = minBgX;
  if (bgY < minBgY) bgY = minBgY;

  return (
    <div
      ref={containerRef}
      className={`relative cursor-crosshair ${className}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onMouseMove={handleMouseMove}
    >
      <img
        src={src}
        alt={alt}
        className="w-full h-auto"
        loading="lazy"
        data-testid={props["data-testid"]}
      />

      {hovering && (
        <div
          className="absolute pointer-events-none border-2 border-white/20 shadow-2xl shadow-black/60"
          style={{
            width: lensSize,
            height: lensSize,
            borderRadius: "50%",
            left: Math.max(0, Math.min(pos.x - half, cw - lensSize)),
            top: Math.max(0, Math.min(pos.y - half, ch - lensSize)),
            overflow: "hidden",
            zIndex: 20,
          }}
        >
          <div
            style={{
              width: lensSize,
              height: lensSize,
              backgroundImage: `url(${src})`,
              backgroundRepeat: "no-repeat",
              backgroundSize: `${bgW}px ${bgH}px`,
              backgroundPosition: `${bgX}px ${bgY}px`,
            }}
          />
        </div>
      )}
    </div>
  );
}
