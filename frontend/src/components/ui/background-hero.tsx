/** Renders profile hero media while avoiding visibly low-quality background upscaling. */
import { useEffect, useRef, useState } from "react";

export function shouldAvoidBackgroundUpscale(
  imageWidth: number,
  imageHeight: number,
  heroWidth: number,
  heroHeight: number
) {
  return imageWidth < heroWidth || imageHeight < heroHeight;
}

type BackgroundHeroProps = {
  src: string;
  alt: string;
};

export function BackgroundHero({ src, alt }: BackgroundHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [containerDimensions, setContainerDimensions] = useState<{ width: number; height: number } | null>(null);
  const useContainedFallback = dimensions !== null && containerDimensions !== null
    && shouldAvoidBackgroundUpscale(
      dimensions.width,
      dimensions.height,
      containerDimensions.width,
      containerDimensions.height
    );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      setContainerDimensions({ width: container.clientWidth, height: container.clientHeight });
    };
    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  function captureDimensions(image: HTMLImageElement) {
    setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
  }

  return (
    <div ref={containerRef} className="relative flex h-full w-full items-center justify-center">
      {useContainedFallback ? (
        <>
          <img src={src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-2xl" />
          <img
            src={src}
            alt={alt}
            onLoad={(event) => captureDimensions(event.currentTarget)}
            className="relative h-auto max-h-full max-w-full object-contain"
            style={{ width: dimensions.width, height: dimensions.height }}
          />
        </>
      ) : (
        <img src={src} alt={alt} onLoad={(event) => captureDimensions(event.currentTarget)} className="h-full w-full object-cover" />
      )}
    </div>
  );
}
