import { useEffect, useRef, useState } from "react";

/**
 * Full-bleed hero backdrop.
 *
 * Renders a muted, looping, inline background video that covers the whole hero
 * area (never a side panel). The poster image is always painted underneath, so
 * we degrade gracefully when:
 *   - no video source is configured yet (`src` empty) -> slow Ken-Burns image
 *   - the browser blocks autoplay / data-saver is on -> poster stays visible
 *   - the visitor prefers reduced motion -> we never start the video
 *
 * Props:
 *   src     - mp4 URL (e.g. "/media/hero-loop.mp4"). Optional.
 *   webm    - optional webm URL for smaller payloads on modern browsers.
 *   poster  - image URL shown before/instead of the video. Required.
 *   alt     - alt text used for the image fallback.
 */
export function HeroVideo({ src, webm, poster, alt = "" }) {
  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const node = videoRef.current;
    if (!node || !src || prefersReducedMotion) return undefined;

    // Some browsers reject autoplay silently; catching keeps the poster in place
    // instead of leaving a dead <video> element on screen.
    const play = node.play();
    if (play?.catch) play.catch(() => setFailed(true));

    // Pause the loop while the hero is off-screen — saves battery on phones.
    const io =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            ([entry]) => {
              if (entry.isIntersecting) node.play?.().catch(() => {});
              else node.pause?.();
            },
            { threshold: 0.1 },
          )
        : null;
    io?.observe(node);
    return () => io?.disconnect();
  }, [src, prefersReducedMotion]);

  const showVideo = Boolean(src) && !failed && !prefersReducedMotion;

  return (
    <div className="hero-video-layer" aria-hidden="true">
      <img
        className={`hero-video-poster${showVideo && ready ? " is-hidden" : ""}${src ? "" : " is-panning"}`}
        src={poster}
        alt={alt}
        fetchPriority="high"
      />
      {showVideo && (
        <video
          ref={videoRef}
          className={`hero-video-media${ready ? " is-ready" : ""}`}
          poster={poster}
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          tabIndex={-1}
          onCanPlay={() => setReady(true)}
          onError={() => setFailed(true)}
        >
          {webm && <source src={webm} type="video/webm" />}
          <source src={src} type="video/mp4" />
        </video>
      )}
      <span className="hero-video-scrim" />
      <span className="hero-video-grain" />
    </div>
  );
}
