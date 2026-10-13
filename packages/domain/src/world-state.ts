export type WorldStateWindowKind = "cycle" | "alert" | "fissure" | "event" | "trader";

export interface WorldStateWindowObservation {
  externalId: string;
  kind: WorldStateWindowKind;
  label: string;
  activation?: string;
  expiry?: string;
  state?: string;
  nodeLabel?: string;
  metadata?: Record<string, string | number | boolean | null>;
  evidence: {
    sourceId: string;
    sourceRecordKey: string;
    snapshotVersion: string;
    retrievedAt: string;
    path?: string;
  };
}
