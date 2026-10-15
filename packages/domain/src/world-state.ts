export type WorldStateWindowKind = "cycle" | "alert" | "fissure" | "event" | "trader";

export interface WorldStateSubjectObservation {
  label: string;
  externalIds?: Array<{ sourceId: string; namespace: string; value: string }>;
}

export interface WorldStateWindowObservation {
  externalId: string;
  kind: WorldStateWindowKind;
  label: string;
  activation?: string;
  expiry?: string;
  state?: string;
  nodeLabel?: string;
  subjects?: WorldStateSubjectObservation[];
  metadata?: Record<string, string | number | boolean | null>;
  evidence: {
    sourceId: string;
    sourceRecordKey: string;
    snapshotVersion: string;
    retrievedAt: string;
    path?: string;
  };
}
