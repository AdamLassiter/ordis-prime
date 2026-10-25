"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { ordisBriefingDurationMs } from "@/lib/ordis-voice-lines";

type BriefingStyle = CSSProperties & {
  "--briefing-duration": string;
};

export function CephalonBriefing({ message }: { message: string }) {
  const [dismissed, setDismissed] = useState(false);
  const duration = ordisBriefingDurationMs(message);
  const style: BriefingStyle = {
    "--briefing-duration": `${duration}ms`,
  };

  useEffect(() => {
    setDismissed(false);
    const timeout = window.setTimeout(() => setDismissed(true), duration);
    return () => window.clearTimeout(timeout);
  }, [duration, message]);

  return (
    <aside
      aria-atomic="true"
      aria-live="polite"
      className={`cephalon-briefing${dismissed ? " is-dismissed" : ""}`}
      style={style}
    >
      <span className="briefing-speaker">ORDIS // PRIORITY MESSAGE</span>
      <p>{message}</p>
      <span className="signal-line" aria-hidden="true" />
    </aside>
  );
}
