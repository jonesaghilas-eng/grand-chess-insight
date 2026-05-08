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
    <div className="ink-shadow rounded-lg overflow-hidden border border-border bg-card p-3 paper-grain">
      <Chessboard
        options={{
          id: "tutor-board",
          position,
          boardOrientation: orientation,
          allowDragging,
          showAnimations: true,
          animationDurationInMs: 220,
          arrows,
          squareStyles: highlightedSquares,
          lightSquareStyle: { backgroundColor: "var(--color-board-light)" },
          darkSquareStyle: { backgroundColor: "var(--color-board-dark)" },
          darkSquareNotationStyle: { color: "var(--color-board-light)", fontFamily: "var(--font-mono)", fontSize: 10 },
          lightSquareNotationStyle: { color: "var(--color-board-dark)", fontFamily: "var(--font-mono)", fontSize: 10 },
          boardStyle: { borderRadius: "6px" },
          arrowOptions: { color: "#c9a84c", opacity: 0.85 } as never,
          onPieceDrop: onDrop,
        } as never}
      />
    </div>
  );
}
