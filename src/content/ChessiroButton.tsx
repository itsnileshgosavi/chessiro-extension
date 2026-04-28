import { useState, useEffect, useRef } from "react";
import Draggable from "react-draggable";
import { Chess } from "chess.js";
import {
  drawNativeArrows,
  clearNativeArrows,
  type ArrowMove,
} from "./drawNativeArrows";

function getChessiroUrl(): string | null {
  const url = window.location.href;

  // Match /game/live/<id>
  const liveMatch = url.match(/chess\.com\/game\/live\/(\d+)/);
  if (liveMatch)
    return `https://chessiro.com/game/${liveMatch[1]}?ref=extension`;

  // Match /game/<id>  (but NOT /game/live/...)
  const gameMatch = url.match(/chess\.com\/game\/(?!live\/)(\d+)/);
  if (gameMatch)
    return `https://chessiro.com/game/${gameMatch[1]}?ref=extension`;

  return null;
}

// ─── FEN extraction via move list ──────────────────────────────────────────────
//
// Confirmed chess.com DOM structure (live & archive games):
//
//   <div class="main-line-row move-list-row ..." data-whole-move-number="1">
//     <div class="node white-move main-line-ply" ...>
//       <span class="node-highlight-content ...">e4 </span>
//     </div>
//     <div class="node black-move main-line-ply" ...>
//       <span class="node-highlight-content ...">c5 </span>
//     </div>
//   </div>

/**
 * Read every SAN move from the move list and replay them with chess.js
 * to produce an accurate FEN (including side-to-move, castling, en-passant).
 */
function computeFenFromMoveList(): string {
  // Each half-move (ply) is a .node.main-line-ply element.
  // The SAN text is inside the .node-highlight-content child span.
  const plies = document.querySelectorAll(".main-line-row .node.main-line-ply");

  if (plies.length === 0) return "";

  const chess = new Chess();

  for (const ply of plies) {
    const sanEl = ply.querySelector(".node-highlight-content");
    const san = sanEl?.textContent?.trim();
    if (!san) continue;
    try {
      chess.move(san);
    } catch {
      // Unrecognized token (e.g. annotation icon text) — stop here
      break;
    }
  }

  return chess.fen();
}

// ─── Extension context guard ─────────────────────────────────────────────────
//
// Chrome throws "Extension context invalidated" when the extension is reloaded
// while its content script is still running in a tab.  We check the runtime id
// before every chrome.* call; if it's gone we bail out silently.

function isContextAlive(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

/** Persist FEN + game metadata to chrome.storage.local */
function saveFen(observer?: MutationObserver) {
  if (!isContextAlive()) {
    // Context gone — stop the observer so we don't keep firing
    observer?.disconnect();
    return;
  }

  const fen = computeFenFromMoveList();
  if (!fen) return;

  const url = window.location.href;
  const liveMatch = url.match(/chess\.com\/game\/live\/(\d+)/);
  const gameMatch = url.match(/chess\.com\/game\/(?!live\/)(\d+)/);
  const gameId = (liveMatch ?? gameMatch)?.[1] ?? null;

  try {
    chrome.storage.local.set({
      chessiroFen: { fen, gameId, timestamp: Date.now() },
    });
  } catch {
    // Context was invalidated between the check and the call — ignore
  }
}

// Debounce to avoid spamming storage on rapid DOM mutations
let fenSaveTimer: ReturnType<typeof setTimeout> | null = null;
let activeObserver: MutationObserver | null = null;

function debouncedSaveFen() {
  if (fenSaveTimer) clearTimeout(fenSaveTimer);
  fenSaveTimer = setTimeout(() => saveFen(activeObserver ?? undefined), 120);
}

/** Start observing the move list for DOM mutations */
function startFenObserver(): MutationObserver {
  const observer = new MutationObserver(debouncedSaveFen);
  activeObserver = observer;

  // The move list lives in the regular (light) DOM — no shadow piercing needed.
  // Watch the whole body so we catch the move list being injected after load.
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true, // catches text node updates inside move spans
  });

  saveFen(observer); // capture immediately on mount

  return observer;
}

export default function ChessiroButton() {
  // Only track whether we're on a game page (for show/hide).
  // The actual URL is always read fresh at click time — never stale.
  const [isOnGamePage, setIsOnGamePage] = useState<boolean>(
    () => getChessiroUrl() !== null,
  );
  const [isHovered, setIsHovered] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const fenObserverRef = useRef<MutationObserver | null>(null);
  // Use refs for drag tracking — avoids render-timing races
  const hasDragged = useRef(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const DRAG_THRESHOLD = 5; // px — micro-movements below this are treated as clicks

  useEffect(() => {
    const check = () => setIsOnGamePage(getChessiroUrl() !== null);

    // 1. Patch history methods (chess.com's primary navigation mechanism)
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    history.pushState = (...args) => {
      origPush(...args);
      check();
    };
    history.replaceState = (...args) => {
      origReplace(...args);
      check();
    };
    window.addEventListener("popstate", check);

    // 2. Poll every 500 ms as a reliable fallback for any navigation
    //    that doesn't go through the patched history methods
    const poll = setInterval(check, 500);

    // 3. Start the FEN observer
    fenObserverRef.current = startFenObserver();

    return () => {
      window.removeEventListener("popstate", check);
      history.pushState = origPush;
      history.replaceState = origReplace;
      clearInterval(poll);
      fenObserverRef.current?.disconnect();
    };
  }, []);

  // ── Draw native board arrows when best moves arrive ──────────────────────
  useEffect(() => {
    if (!isContextAlive()) return;

    // Initial read on mount
    try {
      chrome.storage.local.get(["chessiroBestMoves"], (res) => {
        if (!isContextAlive()) return;
        const stored = res.chessiroBestMoves as
          | { lines: ArrowMove[] }
          | undefined;
        if (stored?.lines?.length) drawNativeArrows(stored.lines);
      });
    } catch {
      /* context invalidated */
    }

    const handleChange = (changes: {
      [k: string]: chrome.storage.StorageChange;
    }) => {
      if (!changes.chessiroBestMoves) return;
      if (changes.chessiroBestMoves) {
        clearNativeArrows();
      }
      const stored = changes.chessiroBestMoves.newValue as
        | { lines: ArrowMove[] }
        | undefined;
      if (stored?.lines?.length) {
        drawNativeArrows(stored.lines);
      } else {
        clearNativeArrows();
      }
    };

    try {
      chrome.storage.onChanged.addListener(handleChange);
    } catch {
      /* context invalidated */
    }

    return () => {
      try {
        chrome.storage.onChanged.removeListener(handleChange);
      } catch {
        /* context already gone */
      }
    };
  }, []);

  if (!isOnGamePage) return null;

  return (
    // Outer fixed anchor — sits at bottom-right
    <div
      style={{
        position: "fixed",
        top: "24px",
        right: "24px",
        zIndex: 2147483647,
        pointerEvents: "none",
      }}
    >
      {/* Draggable wraps the actual button */}
      <Draggable
        nodeRef={nodeRef as React.RefObject<HTMLElement>}
        onStart={(_e, data) => {
          hasDragged.current = false;
          dragStart.current = { x: data.x, y: data.y };
        }}
        onDrag={(_e, data) => {
          if (dragStart.current) {
            const dx = data.x - dragStart.current.x;
            const dy = data.y - dragStart.current.y;
            if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
              hasDragged.current = true;
            }
          }
        }}
        onStop={() => {
          dragStart.current = null;
        }}
      >
        <div
          ref={nodeRef}
          style={{
            cursor: "grab",
            userSelect: "none",
            pointerEvents: "all",
            width: "56px",
            height: "56px",
            position: "relative",
          }}
        >
          {/* Spinning glow ring */}
          <div
            style={{
              position: "absolute",
              inset: "-4px",
              borderRadius: "50%",
              background:
                "conic-gradient(from 0deg, #7c3aed, #3b82f6, #06b6d4, #7c3aed)",
              animation: "chessiro-spin 3s linear infinite",
              opacity: isHovered ? 1 : 0.65,
              transition: "opacity 0.3s ease",
            }}
          />

          {/* Button */}
          <button
            onClick={() => {
              // Only open if the pointer didn't travel more than the drag threshold
              if (!hasDragged.current) {
                const url = getChessiroUrl();
                if (url) window.open(url, "_blank");
              }
              hasDragged.current = false; // reset for next interaction
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            title="Analyze on Chessiro"
            style={{
              position: "relative",
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              border: "none",
              background: isHovered
                ? "linear-gradient(135deg, #4f46e5, #0ea5e9)"
                : "linear-gradient(135deg, #312e81, #1e3a5f)",
              boxShadow: isHovered
                ? "0 0 24px rgba(99,102,241,0.8), 0 8px 32px rgba(0,0,0,0.4)"
                : "0 4px 20px rgba(0,0,0,0.5)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: isHovered ? "scale(1.1)" : "scale(1)",
              transition:
                "transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
              outline: "none",
            }}
          >
            {/* Chess knight SVG */}
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M6 20h12v-2H6v2zM8 18l1-4h6l1 4H8zM7 7c0-2.76 2.24-5 5-5 1.01 0 1.96.3 2.75.82L12 6h2l1.5-2.5C16.42 4.42 17 5.65 17 7c0 1.5-.83 2.81-2.07 3.5L14 14H10l-.93-3.5C7.83 9.81 7 8.5 7 7z"
                fill="white"
              />
            </svg>
          </button>

          {/* Tooltip */}
          {isHovered && (
            <div
              style={{
                position: "absolute",
                right: "calc(100% + 14px)",
                top: "50%",
                transform: "translateY(-50%)",
                background: "rgba(10, 10, 20, 0.95)",
                backdropFilter: "blur(8px)",
                color: "#fff",
                padding: "7px 13px",
                borderRadius: "8px",
                fontSize: "13px",
                fontFamily: "'Inter', system-ui, sans-serif",
                fontWeight: 500,
                whiteSpace: "nowrap",
                border: "1px solid rgba(99,102,241,0.45)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                pointerEvents: "none",
                zIndex: 1,
              }}
            >
              Analyze on Chessiro ♟{/* Arrow */}
              <span
                style={{
                  position: "absolute",
                  right: "-6px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 0,
                  height: 0,
                  borderTop: "6px solid transparent",
                  borderBottom: "6px solid transparent",
                  borderLeft: "6px solid rgba(10,10,20,0.95)",
                  display: "block",
                }}
              />
            </div>
          )}
        </div>
      </Draggable>
    </div>
  );
}
