import { useEffect } from "react";

// The on-screen keyboard does not resize the layout viewport on iOS, so a fixed bottom
// nav would sit on top of it. visualViewport is the only reliable signal for its height.
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--kb-inset", `${Math.round(inset)}px`);
      // Below this, the shrink is browser chrome (URL bar), not a keyboard.
      root.dataset.keyboard = inset > 120 ? "open" : "closed";
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.style.removeProperty("--kb-inset");
      delete root.dataset.keyboard;
    };
  }, []);
}
