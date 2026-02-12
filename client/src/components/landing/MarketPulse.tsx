import { useEffect, useRef } from "react";

interface MarketPulseProps {
  className?: string;
}

class Particle {
  x: number;
  y: number;
  size: number;
  order: boolean;
  velocity: { x: number; y: number };
  originalX: number;
  originalY: number;
  influence: number;
  neighbors: Particle[];

  constructor(x: number, y: number, order: boolean) {
    this.x = x;
    this.y = y;
    this.originalX = x;
    this.originalY = y;
    this.size = 2;
    this.order = order;
    this.velocity = {
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
    };
    this.influence = 0;
    this.neighbors = [];
  }

  update(w: number, h: number) {
    if (this.order) {
      const dx = this.originalX - this.x;
      const dy = this.originalY - this.y;

      const chaosInfluence = { x: 0, y: 0 };
      this.neighbors.forEach((neighbor) => {
        if (!neighbor.order) {
          const distance = Math.hypot(this.x - neighbor.x, this.y - neighbor.y);
          const strength = Math.max(0, 1 - distance / 100);
          chaosInfluence.x += neighbor.velocity.x * strength;
          chaosInfluence.y += neighbor.velocity.y * strength;
          this.influence = Math.max(this.influence, strength);
        }
      });

      this.x += dx * 0.05 * (1 - this.influence) + chaosInfluence.x * this.influence;
      this.y += dy * 0.05 * (1 - this.influence) + chaosInfluence.y * this.influence;
      this.influence *= 0.99;
    } else {
      this.velocity.x += (Math.random() - 0.5) * 0.5;
      this.velocity.y += (Math.random() - 0.5) * 0.5;
      this.velocity.x *= 0.95;
      this.velocity.y *= 0.95;
      this.x += this.velocity.x;
      this.y += this.velocity.y;

      if (this.x < w / 2 || this.x > w) this.velocity.x *= -1;
      if (this.y < 0 || this.y > h) this.velocity.y *= -1;
      this.x = Math.max(w / 2, Math.min(w, this.x));
      this.y = Math.max(0, Math.min(h, this.y));
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const alpha = this.order
      ? 0.6 - this.influence * 0.3
      : 0.55;
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function MarketPulse({ className = "" }: MarketPulseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function setup() {
      if (!canvas || !ctx) return { w: 0, h: 0, particles: [] as Particle[] };

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w === 0 || h === 0) return { w: 0, h: 0, particles: [] as Particle[] };
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      const particles: Particle[] = [];
      const gridCols = 38;
      const gridRows = Math.round((h / w) * gridCols);
      const spacingX = w / gridCols;
      const spacingY = h / gridRows;

      for (let i = 0; i < gridCols; i++) {
        for (let j = 0; j < gridRows; j++) {
          const x = spacingX * i + spacingX / 2;
          const y = spacingY * j + spacingY / 2;
          const order = x < w / 2;
          particles.push(new Particle(x, y, order));
        }
      }

      return { w, h, particles };
    }

    let { w, h, particles } = setup();
    let time = 0;
    let animationId: number;

    function updateNeighbors() {
      particles.forEach((particle) => {
        particle.neighbors = particles.filter((other) => {
          if (other === particle) return false;
          const distance = Math.hypot(particle.x - other.x, particle.y - other.y);
          return distance < 90;
        });
      });
    }

    function animate() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      if (time % 30 === 0) {
        updateNeighbors();
      }

      particles.forEach((particle) => {
        particle.update(w, h);
        particle.draw(ctx);

        particle.neighbors.forEach((neighbor) => {
          const distance = Math.hypot(particle.x - neighbor.x, particle.y - neighbor.y);
          if (distance < 55) {
            const alpha = 0.15 * (1 - distance / 55);
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(neighbor.x, neighbor.y);
            ctx.stroke();
          }
        });
      });

      const midX = w / 2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, h);
      ctx.stroke();

      time++;
      animationId = requestAnimationFrame(animate);
    }

    animate();

    const handleResize = () => {
      cancelAnimationFrame(animationId);
      const result = setup();
      w = result.w;
      h = result.h;
      particles = result.particles;
      time = 0;
      animate();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(animationId);
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
