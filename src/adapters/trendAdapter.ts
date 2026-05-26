import type { CollectOptions, CollectedTrend } from "../types";

export interface TrendAdapter {
  readonly source: CollectedTrend["source"];
  collect(options: CollectOptions): Promise<CollectedTrend[]>;
}
