import { Chessboard, type PieceDropHandlerArgs } from "react-chessboard";

type Props = {
  position: string;
  orientation: "white" | "black";
  onDrop: (args: PieceDropHandlerArgs) => boolean;
  arrows?: { startSquare: string; endSquare: string; color: string }[];
  highlightedSquares?: Record<string, React.CSSProperties>;
  allowDragging?: boolean;
};

export function Board({
  position,
  orientation,
  onDrop,
  arrows = [],
  highlightedSquares = {},
  allowDragging = true,
}: Props) {
  return (
    <div className="frame-shadow rounded-xl overflow-hidden bg-card p-2.5 paper-grain ring-1 ring-[oklch(0.78_0.12_80/0.25)]">
      <Chessboard
        options={{
          id: "tutor-board",
          position,
          boardOrientation: orientation,
          allowDragging,
          showAnimations: true,
          animationDurationInMs: 240,
          arrows,
          squareStyles: highlightedSquares,
          lightSquareStyle: { backgroundColor: "var(--color-board-light)" },
          darkSquareStyle: { backgroundColor: "var(--color-board-dark)" },
          darkSquareNotationStyle: { color: "var(--color-board-light)", fontFamily: "var(--font-mono)", fontSize: 9, opacity: 0.7 },
          lightSquareNotationStyle: { color: "var(--color-board-dark)", fontFamily: "var(--font-mono)", fontSize: 9, opacity: 0.6 },
          boardStyle: { borderRadius: "8px", boxShadow: "inset 0 0 0 1px oklch(0 0 0 / 0.08)" },
          arrowOptions: { color: "#c9a84c", opacity: 0.88 } as never,
          onPieceDrop: onDrop,
        } as never}
      />
    </div>
  );
}
