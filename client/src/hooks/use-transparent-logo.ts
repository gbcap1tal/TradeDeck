import { useRef, useEffect } from "react";

export function useTransparentLogo(src: string) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const brightness = Math.max(r, g, b);
        const isColorful = (Math.max(r, g, b) - Math.min(r, g, b)) > 30;
        if (isColorful) {
          continue;
        }
        if (brightness < 18) {
          d[i + 3] = 0;
        } else if (brightness < 45) {
          d[i + 3] = Math.round(((brightness - 18) / 27) * d[i + 3]);
        }
      }
      ctx.putImageData(imageData, 0, 0);
    };
    img.src = src;
  }, [src]);
  return canvasRef;
}
