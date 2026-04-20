import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ChessiroButton from "./ChessiroButton";

// Inject keyframe animation into the page's <head>
const style = document.createElement("style");
style.id = "chessiro-ext-styles";
style.textContent = `
  @keyframes chessiro-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

// Simple plain div — no Shadow DOM, no "all: initial" that resets display
const container = document.createElement("div");
container.id = "chessiro-extension-root";
// Just a neutral wrapper; the button inside manages its own fixed positioning
container.style.cssText = `
  position: fixed;
  pointer-events: none;
  top: 0; left: 0;
  width: 0; height: 0;
  z-index: 2147483647;
  overflow: visible;
`;
document.body.appendChild(container);

createRoot(container).render(
  <StrictMode>
    <ChessiroButton />
  </StrictMode>
);
