import { useEffect, useRef, useState } from "react";

/**
 * Auto-advancing hero slider. Supports a mix of image and video slides.
 *
 * slides: [{ id, type: "image" | "video", src, alt, poster }]
 *   - image slides need `src` + `alt`
 *   - video slides need `src` (mp4) and should include a `poster` image so
 *     there's something to show while the video loads (and on browsers/data-saver
 *     modes that block autoplay). Videos always render muted + looping + inline,
 *     since that's the only way autoplay is reliably allowed without a user click.
 *
 * Pauses on hover/focus and whenever the visitor has requested reduced motion.
 */
export function HeroSlider({ slides, interval = 5500, className = "" }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const prefersReducedMotion = useRef(typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const count = slides.length;

  useEffect(() => {
    if (paused || prefersReducedMotion.current || count <= 1) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), interval);
    return () => clearInterval(timer);
  }, [paused, count, interval]);

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  if (!count) return null;

  const go = (next) => setIndex(((next % count) + count) % count);

  return (
    <div
      className={`hero-slider ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      role="region"
      aria-roledescription="carousel"
      aria-label="FikarNot showcase"
    >
      <div className="hero-slider-track" style={{ transform: `translateX(-${index * 100}%)` }}>
        {slides.map((slide, i) => (
          <div
            className="hero-slide"
            key={slide.id || i}
            aria-hidden={i !== index}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}`}
          >
            {slide.type === "video" ? (
              <video className="hero-slide-media" autoPlay muted loop playsInline poster={slide.poster} preload={i === 0 ? "auto" : "none"}>
                <source src={slide.src} type="video/mp4" />
              </video>
            ) : (
              <img className="hero-slide-media" src={slide.src} alt={i === index ? slide.alt : ""} loading={i === 0 ? "eager" : "lazy"} />
            )}
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          <button type="button" className="hero-slider-arrow hero-slider-prev" aria-label="Previous slide" onClick={() => go(index - 1)}>
            <span aria-hidden="true">‹</span>
          </button>
          <button type="button" className="hero-slider-arrow hero-slider-next" aria-label="Next slide" onClick={() => go(index + 1)}>
            <span aria-hidden="true">›</span>
          </button>
          <div className="hero-slider-dots" role="tablist" aria-label="Choose slide">
            {slides.map((slide, i) => (
              <button
                key={slide.id || i}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Go to slide ${i + 1}`}
                className={`hero-slider-dot${i === index ? " active" : ""}`}
                onClick={() => go(i)}
              />
            ))}
          </div>
          <span className="sr-only" aria-live="polite">
            Slide {index + 1} of {count}
          </span>
        </>
      )}
    </div>
  );
}
