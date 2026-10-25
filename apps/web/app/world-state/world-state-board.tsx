"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CurrentWorldStateWindow } from "@ordis-prime/db";

const kindLabels = {
  cycle: "Cycles",
  event: "Events",
  alert: "Alerts",
  fissure: "Void Fissures",
  trader: "Traders",
} as const;

export function WorldStateBoard({
  windows,
  initialNow,
}: {
  windows: CurrentWorldStateWindow[];
  initialNow: number;
}) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="world-state-groups">
      {Object.entries(kindLabels).map(([kind, title]) => {
        const entries = windows.filter((entry) => entry.kind === kind);
        if (!entries.length) return null;
        return (
          <section className="world-state-section" key={kind}>
            <h2>{title}</h2>
            <div className="grid world-state-grid preference-collection">
              {entries.map((entry) => (
                <WorldStateCard
                  key={`${entry.sourceId}:${entry.externalId}`}
                  entry={entry}
                  now={now}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function WorldStateCard({
  entry,
  now,
}: {
  entry: CurrentWorldStateWindow;
  now: number;
}) {
  const upcoming = entry.activation !== undefined && entry.activation > now;
  const expired = entry.expiry !== undefined && entry.expiry <= now;
  const boundary = upcoming ? entry.activation : entry.expiry;
  return (
    <article
      className={`card world-state-card preference-card${expired ? " expired" : ""}`}
    >
      <div className="world-state-heading">
        <span className={`tag ${upcoming ? "upcoming" : "active"}`}>
          {expired ? "expired" : upcoming ? "upcoming" : "active"}
        </span>
        {entry.state && <span className="state-label">{entry.state}</span>}
      </div>
      <h3>{entry.label}</h3>
      {entry.subjects.length > 0 && (
        <p className="muted">
          Related:{" "}
          {entry.subjects.map((subject, index) => (
            <span key={`${subject.kind}:${subject.slug}`}>
              {index > 0 ? ", " : ""}
              <Link href={`/catalog/${subject.kind}/${subject.slug}`}>
                {subject.name}
              </Link>
            </span>
          ))}
        </p>
      )}
      {entry.nodeLabel && (
        <p className="world-state-node">
          {entry.node ? (
            <Link href={`/nodes/${entry.node.slug}`}>{entry.nodeLabel}</Link>
          ) : (
            entry.nodeLabel
          )}
        </p>
      )}
      <p className="countdown">
        {expired ? (
          "Refresh needed"
        ) : boundary === undefined ? (
          "No end time supplied"
        ) : (
          <>
            <span>{upcoming ? "Starts" : "Ends"} in</span>{" "}
            {formatDuration(boundary - now)}
          </>
        )}
      </p>
      {boundary !== undefined && (
        <time className="muted" dateTime={new Date(boundary).toISOString()}>
          {formatInstant(boundary)}
        </time>
      )}
    </article>
  );
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  if (days) return `${days}d ${hours}h ${minutes}m`;
  if (hours) return `${hours}h ${minutes}m ${remainder}s`;
  return `${minutes}m ${remainder}s`;
}

function formatInstant(timestamp: number): string {
  return `${new Date(timestamp).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
