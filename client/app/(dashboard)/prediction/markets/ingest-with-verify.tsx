"use client";

// Page-local IngestButton wrapper that wires the verify callback. The
// callback re-fetches the prediction_markets list and returns its length,
// so the button can poll for the consumer to actually land data + report
// "新增 N 条" instead of just refreshing blindly.

import { IngestButton } from "@/components/ingest-button";
import { listPredictionMarkets } from "@/data/api-client";

export function IngestWithVerify() {
  return (
    <IngestButton
      path="v1/admin/ingest/prediction"
      verify={async () => {
        const items = await listPredictionMarkets({ limit: 1000 });
        return items.length;
      }}
    />
  );
}
