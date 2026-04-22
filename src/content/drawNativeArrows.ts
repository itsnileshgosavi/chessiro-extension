/**
 * drawNativeArrows.ts — isolated world side.
 *
 * Instead of firing DOM events directly (which don't reach shadow-DOM
 * listeners), we delegate to the MAIN-world content script via postMessage.
 * The MAIN-world script (mainWorld.ts) receives the message and fires events
 * in the page's real JavaScript context.
 */

export type ArrowMove = { move: string; rank: number };

export function drawNativeArrows(moves: ArrowMove[]): void {
  window.postMessage({ source: "chessiro", type: "draw-arrows", moves }, "*");
}

export function clearNativeArrows(): void {
  window.postMessage({ source: "chessiro", type: "clear-arrows" }, "*");
}
