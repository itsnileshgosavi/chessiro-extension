import { useEffect, useState } from "react";
import FenDisplay from "./components/fenDisplay";
import BestMove from "./components/BestMove";
import { useStockfish } from "./hooks/useStockfish";

type FenData = { fen: string; gameId: string | null; timestamp: number };

function App() {
  const [fenData, setFenData] = useState<FenData | null>(null);
  const { result, analyse } = useStockfish();

  // Mirror the FEN from chrome.storage so App can pass it down
  useEffect(() => {
    chrome.storage.local.get(["chessiroFen"], (res) => {
      if (res.chessiroFen) setFenData(res.chessiroFen as FenData);
    });

    const handleChange = (changes: {
      [k: string]: chrome.storage.StorageChange;
    }) => {
      if (changes.chessiroFen) {
        setFenData((changes.chessiroFen.newValue as FenData) ?? null);
      }
    };
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);

  // Re-analyse whenever the FEN changes
  useEffect(() => {
    if (fenData?.fen) analyse(fenData.fen);
  }, [fenData?.fen, analyse]);

  // Broadcast best-move lines → content script draws native arrows on the board
  useEffect(() => {
    if (result.loading || !result.lines.some((l) => l.move)) return;
    const lines = result.lines
      .filter((l) => l.move)
      .map((l, i) => ({ move: l.move, rank: i }));
    chrome.storage.local.set({
      chessiroBestMoves: { lines, fen: fenData?.fen ?? "", timestamp: Date.now() },
    });
  }, [result.lines, result.loading, fenData?.fen]);

  return (
    <main className="container flex flex-col items-center w-96 py-4 px-3 gap-3">
      <h1 className="text-center font-bold text-2xl w-full">
        Chess Analysis +
      </h1>

      {/* Current game FEN */}
      <FenDisplay />

      {/* Stockfish best move */}
      <BestMove result={result} fen={fenData?.fen ?? null} />

      <div className="w-full border-t border-border" />
    </main>
  );
}

export default App;
