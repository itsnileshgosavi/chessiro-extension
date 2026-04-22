/**
 * mainWorld.ts — runs with world: "MAIN" (page's own JS context).
 *
 * Receives { source: "chessiro", type: "draw-arrows", moves: [...] }
 * from the isolated-world content script via window.postMessage and fires
 * right-click drag events on the chess.com board in the page's real JS realm.
 *
 * Running in MAIN world means:
 *  - Shadow-DOM event listeners on wc-chess-board are reachable
 *  - We can access chess.com's internal board properties directly
 */

type ArrowMove = { move: string; rank: number };

const RANK_MODS = [
  { altKey: false, ctrlKey: false, shiftKey: false }, // green  – best
  { altKey: true,  ctrlKey: false, shiftKey: false }, // blue   – 2nd
  { altKey: false, ctrlKey: true,  shiftKey: false }, // orange – 3rd
] as const;

function squareCentre(
  sq: string,
  rect: DOMRect,
  sz: number,
  flipped: boolean,
): { x: number; y: number } {
  const file = sq.charCodeAt(0) - 97;
  const rank = sq.charCodeAt(1) - 49;
  const col  = flipped ? 7 - file : file;
  const row  = flipped ? rank : 7 - rank;
  return { x: rect.left + (col + 0.5) * sz, y: rect.top + (row + 0.5) * sz };
}

/**
 * Detect whether the chess.com board is visually flipped (black at bottom).
 *
 * Strategy 1 — JS property access (only works in MAIN world):
 *   chess.com's custom element may expose .flipped or .orientation as properties.
 *
 * Strategy 2 — HTML attribute / class names.
 *
 * Strategy 3 — Ground truth: compare a piece element's square-XY class
 *   (where X=file 1-8, Y=rank 1-8) against its actual pixel position.
 *   If the piece's visual column matches the flipped formula (7 - (X-1))
 *   better than the normal formula (X-1), the board is flipped.
 *   This is completely immune to chess.com renaming attributes.
 */
function isFlipped(board: Element): boolean {
  // ── Strategy 1: JS properties (MAIN world only) ───────────────────────────
  try {
    const b = board as unknown as Record<string, unknown>;
    if (b["flipped"] === true) return true;
    if (b["orientation"] === "black") return true;
    if (b["boardOrientation"] === "black") return true;
    if ((b["game"] as Record<string, unknown>)?.["orientation"] === "black") return true;
  } catch { /* ignore */ }

  // ── Strategy 2: Attributes / classes ─────────────────────────────────────
  if (
    board.classList.contains("flipped") ||
    board.getAttribute("flipped") === "true" ||
    board.getAttribute("flipped") === "" ||
    board.getAttribute("board-orientation") === "black" ||
    board.getAttribute("orientation") === "black"
  ) return true;

  // ── Strategy 3: Piece-position ground truth ───────────────────────────────
  // chess.com piece elements live in the shadow DOM and carry a class like
  // "piece wp square-51" where the last class encodes file(1-8) + rank(1-8).
  try {
    const sr = (board as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot ?? board;
    const boardRect = board.getBoundingClientRect();
    const sz = boardRect.width / 8;
    if (sz > 0) {
      // Grab several pieces and vote — single-piece edge cases (e.g. king moved) are handled
      const pieces = sr.querySelectorAll<HTMLElement>("[class*='square-']");
      let votesNormal = 0, votesFlipped = 0;

      for (const piece of pieces) {
        const m = piece.className.match(/square-(\d)(\d)/);
        if (!m) continue;
        const file0 = parseInt(m[1]) - 1; // 0-indexed  0=a … 7=h
        const pieceRect = piece.getBoundingClientRect();
        const actualCol = Math.round((pieceRect.left - boardRect.left) / sz);
        const distNormal  = Math.abs(actualCol - file0);
        const distFlipped = Math.abs(actualCol - (7 - file0));
        if (distNormal <= distFlipped) votesNormal++;  else votesFlipped++;
        if (votesNormal + votesFlipped >= 4) break; // enough sample
      }

      if (votesFlipped > votesNormal) return true;
      if (votesNormal > 0 || votesFlipped > 0) return false; // definitive result
    }
  } catch { /* ignore */ }

  return false;
}


type Mods = { altKey: boolean; ctrlKey: boolean; shiftKey: boolean };

function fire(
  type: "mousedown" | "mousemove" | "mouseup",
  x: number,
  y: number,
  mods: Mods,
  board: Element,
): void {
  // Prefer elements inside the shadow root (web-component internals)
  const sr = (board as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot;
  const target =
    sr?.elementFromPoint(x, y) ??
    document.elementFromPoint(x, y) ??
    board;

  const opts = {
    bubbles: true,
    cancelable: true,
    composed: true, // cross shadow-DOM boundaries when bubbling
    view: window,
    button: 2,
    buttons: type === "mouseup" ? 0 : 2,
    clientX: x,
    clientY: y,
    ...mods,
  };

  // Fire PointerEvent first (preferred by modern web components)
  const ptype = type.replace("mouse", "pointer") as
    | "pointerdown"
    | "pointermove"
    | "pointerup";
  target.dispatchEvent(
    new PointerEvent(ptype, { ...opts, pointerId: 1, pointerType: "mouse", isPrimary: true }),
  );

  // Then MouseEvent as fallback
  target.dispatchEvent(new MouseEvent(type, opts));

  // Also dispatch on board host so shadow-root listeners catch it
  if (target !== board) {
    board.dispatchEvent(new PointerEvent(ptype, { ...opts, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    board.dispatchEvent(new MouseEvent(type, opts));
  }
}

function clearArrows(): void {
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape", code: "Escape", keyCode: 27,
      bubbles: true, cancelable: true, composed: true,
    }),
  );
}

function drawArrows(moves: ArrowMove[]): void {
  const board =
    document.querySelector<Element>("wc-chess-board") ??
    document.querySelector<Element>(".board");
  if (!board) return;

  const rect = board.getBoundingClientRect();
  const sz   = rect.width / 8;
  const flip = isFlipped(board);

  clearArrows();

  for (const { move, rank } of moves) {
    if (!move || move.length < 4) continue;
    const mods = RANK_MODS[rank] ?? RANK_MODS[2];
    const p1 = squareCentre(move.slice(0, 2), rect, sz, flip);
    const p2 = squareCentre(move.slice(2, 4), rect, sz, flip);
    fire("mousedown", p1.x, p1.y, mods, board);
    fire("mousemove", p2.x, p2.y, mods, board);
    fire("mouseup",   p2.x, p2.y, mods, board);
  }
}

// ── Message bridge ────────────────────────────────────────────────────────────

window.addEventListener("message", (e: MessageEvent) => {
  if (e.source !== window) return;
  const msg = e.data as { source?: string; type?: string; moves?: ArrowMove[] };
  if (msg?.source !== "chessiro") return;

  if (msg.type === "draw-arrows" && Array.isArray(msg.moves)) {
    drawArrows(msg.moves);
  } else if (msg.type === "clear-arrows") {
    clearArrows();
  }
});
