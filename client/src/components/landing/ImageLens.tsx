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
  lensSize = 180,
  zoom = 2.5,
  ...props
}: ImageLensProps) {
  const [hovering, setHovering] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

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

  return (
    <div
      ref={containerRef}
      className={`relative cursor-crosshair ${className}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onMouseMove={handleMouseMove}
    >
      <img
        ref={imgRef}
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
            left: pos.x - half,
            top: pos.y - half,
            overflow: "hidden",
            zIndex: 20,
            backdropFilter: "blur(0px)",
          }}
        >
          <div
            style={{
              width: lensSize,
              height: lensSize,
              backgroundImage: `url(${src})`,
              backgroundRepeat: "no-repeat",
              backgroundSize: `${(containerRef.current?.offsetWidth ?? 400) * zoom}px auto`,
              backgroundPosition: `-${pos.x * zoom - half}px -${pos.y * zoom - half}px`,
            }}
          />
        </div>
      )}
    </div>
  );
}
