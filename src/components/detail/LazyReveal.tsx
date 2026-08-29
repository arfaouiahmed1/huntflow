"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface LazyRevealProps {
  children: React.ReactNode;
  /** Reserve vertical space while unloaded so the page doesn't jump. */
  minHeight?: number;
  className?: string;
}

/**
 * Mounts children only once scrolled near the viewport, then keeps them mounted.
 * Heavy panels stay unrendered (and un-fetched) until the reader reaches them.
 */
const LazyReveal = forwardRef<HTMLDivElement, LazyRevealProps>(function LazyReveal(
  { children, minHeight = 220, className },
  ref
) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = holderRef.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "320px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div
      ref={(el) => {
        holderRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      className={cn(className)}
      style={visible ? undefined : { minHeight }}
    >
      {visible ? children : null}
    </div>
  );
});

export default LazyReveal;
