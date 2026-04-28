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
  { altKey: true, ctrlKey: false, shiftKey: false }, // blue   – 2nd
  { altKey: false, ctrlKey: true, shiftKey: false }, // orange – 3rd
] as const;

/**
 * Returns pixel coordinates relative to the top-left of the board element.
 * These are used as offsetX/offsetY for canvas mouse events.
 */
function squareCentre(
  sq: string,
  sz: number,
  flipped: boolean,
): { offsetX: number; offsetY: number } {
  const file = sq.charCodeAt(0) - 97; // 0=a … 7=h
  const rank = sq.charCodeAt(1) - 49; // 0=rank1 … 7=rank8
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank : 7 - rank;
  return {
    offsetX: (col + 0.5) * sz,
    offsetY: (row + 0.5) * sz,
  };
}

/**
 * Detect whether the chess.com board is visually flipped (black at bottom).
 *
 * Strategy 1 — JS property deep-scan (MAIN world only).
 * Strategy 2 — HTML attribute / class names.
 * Strategy 3 — Page-DOM player panel (most reliable for canvas/WebGL boards).
 * Strategy 4 — Piece-position ground truth (non-canvas boards only).
 */
function isFlipped(board: Element): boolean {
  // ── Strategy 1: JS property deep-scan ────────────────────────────────────
  // canvas boards (board-webgl-2d) store orientation on the JS component object,
  // not on DOM attributes. Scan a broad set of known property names.
  try {
    const b = board as unknown as Record<string, unknown>;

    const directProps = [
      "flipped", "orientation", "boardOrientation",
      "perspective", "playerColor", "myColor", "bottomColor", "color",
      "playingAs", "playerSide", "bottomPlayer",
    ];
    for (const prop of directProps) {
      const val = b[prop];
      if (val === true || val === "black" || val === "b") return true;
      if (val === false || val === "white" || val === "w") return false;
    }

    // One level deeper: game / controller / state sub-objects
    const nestedObjects = ["game", "controller", "state", "boardState", "_game"];
    const nestedProps = [
      "orientation", "flipped", "playerColor", "myColor",
      "perspective", "bottomColor", "playingAs",
    ];
    for (const obj of nestedObjects) {
      const nested = b[obj] as Record<string, unknown> | undefined;
      if (!nested || typeof nested !== "object") continue;
      for (const prop of nestedProps) {
        const val = nested[prop];
        if (val === true || val === "black" || val === "b") return true;
        if (val === false || val === "white" || val === "w") return false;
      }
    }
  } catch { /* ignore */ }

  // ── Strategy 2: Attributes / classes ─────────────────────────────────────
  if (
    board.classList.contains("flipped") ||
    board.getAttribute("flipped") === "true" ||
    board.getAttribute("flipped") === "" ||
    board.getAttribute("board-orientation") === "black" ||
    board.getAttribute("orientation") === "black"
  ) return true;

  // ── Strategy 3: Page-DOM player panel ────────────────────────────────────
  // chess.com renders a player component above and below the board.
  // The bottom player is the one whose pieces sit at rank 1 (white) or rank 8 (black).
  // If the bottom panel belongs to black, the board is flipped.
  try {
    const boardRect = board.getBoundingClientRect();
    const boardMidY = boardRect.top + boardRect.height / 2;

    // Walk up to find the game container that holds player panels
    let container: Element | null = board.parentElement;
    for (let i = 0; i < 8 && container; i++) {
      if (container.querySelector("[class*='player']")) break;
      container = container.parentElement;
    }
    if (!container) container = document.body;

    const playerSelectors = [
      "[class*='player-component']",
      "[class*='user-tagline']",
      "[class*='clock-component']",
      "chess-board-player",
      "wc-chess-clock",
    ];

    for (const sel of playerSelectors) {
      const players = Array.from(container.querySelectorAll<HTMLElement>(sel));
      if (players.length < 2) continue;

      // Bottom player = element whose vertical centre is below the board centre
      const bottom = players.find(el => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2 > boardMidY;
      });
      if (!bottom) continue;

      const bottomClass = (bottom.className ?? "").toLowerCase();

      // Explicit colour class hints
      if (/\b(black|bking|bqueen|brook|bbishop|bknight|bpawn)\b/.test(bottomClass))
        return true;
      if (/\b(white|wking|wqueen|wrook|wbishop|wknight|wpawn)\b/.test(bottomClass))
        return false;

      // Piece icon src or class inside the panel
      const pieceEl = bottom.querySelector<HTMLElement>(
        "[class*='piece'], img[src*='piece'], [class*='icon-piece']",
      );
      if (pieceEl) {
        const hint = ((pieceEl.className ?? "") + (pieceEl.getAttribute("src") ?? ""))
          .toLowerCase();
        if (/[/_-]b[/_-]|\/b\/|black/.test(hint)) return true;
        if (/[/_-]w[/_-]|\/w\/|white/.test(hint)) return false;
      }

      // aria-label or visible text
      const label = (bottom.getAttribute("aria-label") ?? bottom.textContent ?? "")
        .toLowerCase();
      if (label.includes("black")) return true;
      if (label.includes("white")) return false;
    }
  } catch { /* ignore */ }

  // ── Strategy 4: Piece-position ground truth (non-canvas boards) ───────────
  try {
    const sr =
      (board as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot ??
      board;
    const boardRect = board.getBoundingClientRect();
    const sz = boardRect.width / 8;
    if (sz > 0) {
      const pieces = sr.querySelectorAll<HTMLElement>("[class*='square-']");
      let votesNormal = 0, votesFlipped = 0;
      for (const piece of pieces) {
        const m = piece.className.match(/square-(\d)(\d)/);
        if (!m) continue;
        const file0 = parseInt(m[1]) - 1;
        const pieceRect = piece.getBoundingClientRect();
        const actualCol = Math.round((pieceRect.left - boardRect.left) / sz);
        if (Math.abs(actualCol - file0) <= Math.abs(actualCol - (7 - file0)))
          votesNormal++;
        else votesFlipped++;
        if (votesNormal + votesFlipped >= 4) break;
      }
      if (votesFlipped > votesNormal) return true;
      if (votesNormal > 0 || votesFlipped > 0) return false;
    }
  } catch { /* ignore */ }

  return false;
}

type Mods = { altKey: boolean; ctrlKey: boolean; shiftKey: boolean };

/**
 * Resolves the <canvas> element inside wc-chess-board.
 * chess.com renders everything on a single canvas and listens to events there.
 */
function getCanvas(board: Element): HTMLCanvasElement | null {
  // Check inside shadow root first
  const sr = (board as HTMLElement & { shadowRoot: ShadowRoot | null })
    .shadowRoot;
  const canvas =
    sr?.querySelector<HTMLCanvasElement>("canvas") ??
    board.querySelector<HTMLCanvasElement>("canvas");
  return canvas;
}

/**
 * Fires a right-click mouse (+ pointer) event on the canvas.
 *
 * @param type      mousedown | mousemove | mouseup
 * @param offsetX   pixels from the left edge of the canvas
 * @param offsetY   pixels from the top edge of the canvas
 * @param mods      keyboard modifiers that select the arrow colour
 * @param canvas    the <canvas> element to dispatch on
 */
function fire(
  type: "mousedown" | "mousemove" | "mouseup",
  offsetX: number,
  offsetY: number,
  mods: Mods,
  canvas: HTMLCanvasElement,
): void {
  const rect = canvas.getBoundingClientRect();
  // Scale: the canvas CSS size may differ from its internal resolution
  const scaleX = rect.width / canvas.offsetWidth || 1;
  const scaleY = rect.height / canvas.offsetHeight || 1;
  const clientX = rect.left + offsetX * scaleX;
  const clientY = rect.top + offsetY * scaleY;

  const isUp = type === "mouseup";
  const opts: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 2,
    buttons: isUp ? 0 : 2,
    clientX,
    clientY,
    // offsetX/offsetY are read-only on real events but synthetic events
    // do not carry them; chess.com may use currentTarget-relative coords
    // derived from clientX/clientY, so clientX/clientY are what matters.
    ...mods,
  };

  const ptype = type.replace("mouse", "pointer") as
    | "pointerdown"
    | "pointermove"
    | "pointerup";

  canvas.dispatchEvent(
    new PointerEvent(ptype, {
      ...opts,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
    }),
  );
  canvas.dispatchEvent(new MouseEvent(type, opts));
}

function clearArrows(): void {
  const board =
    document.querySelector<Element>("wc-chess-board") ??
    document.querySelector<Element>(".board");
  if (!board) return;

  const canvas = getCanvas(board);
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  // Click the centre of the board with the left button to dismiss arrows
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const opts: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    button: 0,
    buttons: 1,
    clientX: cx,
    clientY: cy,
  };

  const pointerOpts = { ...opts, pointerId: 1, pointerType: "mouse", isPrimary: true };

  canvas.dispatchEvent(new PointerEvent("pointerdown", pointerOpts));
  canvas.dispatchEvent(new MouseEvent("mousedown", opts));
  canvas.dispatchEvent(new PointerEvent("pointerup", { ...pointerOpts, buttons: 0 }));
  canvas.dispatchEvent(new MouseEvent("mouseup", { ...opts, buttons: 0 }));
  canvas.dispatchEvent(new MouseEvent("click", { ...opts, buttons: 0 }));
}

function drawArrows(moves: ArrowMove[]): void {
  const board =
    document.querySelector<Element>("wc-chess-board") ??
    document.querySelector<Element>(".board");
  if (!board) return;

  const canvas = getCanvas(board);
  if (!canvas) return;

  // Use the canvas CSS size as the board pixel size (not the canvas resolution)
  const sz = canvas.getBoundingClientRect().width / 8;
  const flip = isFlipped(board);

  clearArrows();

  for (const { move, rank } of moves) {
    if (!move || move.length < 4) continue;
    const mods = RANK_MODS[rank] ?? RANK_MODS[2];
    const p1 = squareCentre(move.slice(0, 2), sz, flip);
    const p2 = squareCentre(move.slice(2, 4), sz, flip);
    fire("mousedown", p1.offsetX, p1.offsetY, mods, canvas);
    fire("mousemove", p2.offsetX, p2.offsetY, mods, canvas);
    fire("mouseup", p2.offsetX, p2.offsetY, mods, canvas);
  }
}

// ── Message bridge ────────────────────────────────────────────────────────────

window.addEventListener("message", (e: MessageEvent) => {
  if (e.source !== window) return;
  const msg = e.data as { source?: string; type?: string; moves?: ArrowMove[] };
  if (msg?.source !== "chess") return;

  if (msg.type === "draw-arrows" && Array.isArray(msg.moves)) {
    drawArrows(msg.moves);
  } else if (msg.type === "clear-arrows") {
    clearArrows();
  }
});
