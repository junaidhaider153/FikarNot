import { useEffect, useRef } from "react";

const INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, [role="button"], .card, [tabindex]:not([tabindex="-1"])';

// A soft glow that trails the cursor, purely decorative. It's built to cost
// nothing when it can't look good or wouldn't be appreciated: skipped
// entirely on touch devices (no mouse to follow), when the OS has
// prefers-reduced-motion set, and it never intercepts clicks or drags
// (pointer-events: none) or fires a React re-render per mousemove — position
// is written straight to the DOM via refs and eased with requestAnimationFrame.
export function CursorGlow() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);

  useEffect(() => {
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!canHover || reduceMotion) return undefined;

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return undefined;

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let ringX = targetX;
    let ringY = targetY;
    let visible = false;
    let rafId = null;

    const onMove = (event) => {
      targetX = event.clientX;
      targetY = event.clientY;
      dot.style.transform = `translate(${targetX}px, ${targetY}px)`;
      if (!visible) {
        visible = true;
        dot.style.opacity = "1";
        ring.style.opacity = "1";
      }
    };
    const onLeave = () => {
      visible = false;
      dot.style.opacity = "0";
      ring.style.opacity = "0";
    };
    const onOver = (event) => {
      if (event.target.closest?.(INTERACTIVE_SELECTOR)) ring.classList.add("is-active");
    };
    const onOut = (event) => {
      if (event.target.closest?.(INTERACTIVE_SELECTOR)) ring.classList.remove("is-active");
    };

    const tick = () => {
      // Ease the outer ring toward the raw cursor position so it trails
      // slightly behind the dot instead of snapping to it 1:1.
      ringX += (targetX - ringX) * 0.18;
      ringY += (targetY - ringY) * 0.18;
      ring.style.transform = `translate(${ringX}px, ${ringY}px)`;
      rafId = window.requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseover", onOver, { passive: true });
    document.addEventListener("mouseout", onOut, { passive: true });
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="cursor-glow" aria-hidden="true">
      <div className="cursor-glow-ring" ref={ringRef} />
      <div className="cursor-glow-dot" ref={dotRef} />
    </div>
  );
}
