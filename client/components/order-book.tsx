import { ReactNode } from "react";

// Node 2.C.2 — OrderBook ladder.
//
// Dense bid/ask ladder used on prediction-market and (future) spot/futures
// detail pages. The component is intentionally pure: it takes pre-sorted
// rows and renders them. WS subscription, throttling and depth aggregation
// happen one layer up so this stays cheap to re-render.
//
// Each row carries a horizontal "depth" bar whose width is proportional to
// `size / maxSize` and tinted with the side's accent color (green for bid,
// red for ask). Bid prices are right-aligned (closest to the spread),
// ask prices are left-aligned. The midpoint is rendered as a thin band
// between the two halves when `mid` is provided.

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBookProps {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  maxRows?: number;
  /** Override the max size used to scale depth bars. Defaults to the largest
   * size visible in either side. */
  maxSize?: number;
  /** Number of decimal places for prices. */
  priceFmt?: (n: number) => string;
  /** Number of decimal places for sizes. */
  sizeFmt?: (n: number) => string;
  /** Optional mid-band rendered between the two ladders. */
  mid?: ReactNode;
  className?: string;
}

const DEFAULT_PRICE_FMT = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 4 });
const DEFAULT_SIZE_FMT = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 4 });

export function OrderBook({
  bids,
  asks,
  maxRows = 20,
  maxSize,
  priceFmt = DEFAULT_PRICE_FMT,
  sizeFmt = DEFAULT_SIZE_FMT,
  mid,
  className,
}: OrderBookProps) {
  const trimmedBids = bids.slice(0, maxRows);
  // Asks are usually published ascending (closest first). We want lowest at
  // the bottom so the spread sits in the middle when the two halves are
  // stacked. Render ascending then reverse so the visual flows from spread
  // outwards.
  const trimmedAsks = asks.slice(0, maxRows);
  const computedMax =
    maxSize ??
    Math.max(
      1,
      ...trimmedBids.map((b) => b.size),
      ...trimmedAsks.map((a) => a.size),
    );

  return (
    <div
      className={`font-mono text-mono-sm tnum text-text-primary ${className ?? ""}`}
    >
      {/* Asks rendered top-down with the lowest ask closest to the spread.
       * The array is ascending (closest-first), so we reverse to put the
       * furthest ask at the top. */}
      <div className="flex flex-col-reverse">
        {trimmedAsks.map((lvl, i) => (
          <OrderBookRow
            key={`ask-${i}-${lvl.price}`}
            level={lvl}
            side="ask"
            maxSize={computedMax}
            priceFmt={priceFmt}
            sizeFmt={sizeFmt}
          />
        ))}
      </div>
      {mid && (
        <div className="border-y border-border-default bg-bg-surface-2 px-2 py-1 text-center text-text-secondary">
          {mid}
        </div>
      )}
      <div>
        {trimmedBids.map((lvl, i) => (
          <OrderBookRow
            key={`bid-${i}-${lvl.price}`}
            level={lvl}
            side="bid"
            maxSize={computedMax}
            priceFmt={priceFmt}
            sizeFmt={sizeFmt}
          />
        ))}
      </div>
    </div>
  );
}

function OrderBookRow({
  level,
  side,
  maxSize,
  priceFmt,
  sizeFmt,
}: {
  level: OrderBookLevel;
  side: "bid" | "ask";
  maxSize: number;
  priceFmt: (n: number) => string;
  sizeFmt: (n: number) => string;
}) {
  const widthPct = Math.min(100, Math.max(0, (level.size / maxSize) * 100));
  const priceColor = side === "bid" ? "text-accent-up" : "text-accent-down";
  // The depth bar anchors to the right edge — that's the conventional
  // direction (more depth pushes towards the spread). Bid bars use green
  // tint, asks use red tint. Both at 10% opacity so the price text remains
  // readable in light + dark themes.
  const barColor = side === "bid" ? "bg-accent-up/10" : "bg-accent-down/10";

  return (
    <div className="relative grid grid-cols-2 px-2 h-7 items-center hover:bg-bg-surface-2/60">
      <div
        aria-hidden
        className={`absolute inset-y-0 right-0 ${barColor}`}
        style={{ width: `${widthPct}%` }}
      />
      <div className={`relative z-10 text-left ${priceColor}`}>
        {priceFmt(level.price)}
      </div>
      <div className="relative z-10 text-right text-text-secondary">
        {sizeFmt(level.size)}
      </div>
    </div>
  );
}
