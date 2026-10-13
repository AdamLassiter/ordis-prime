"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

interface ImportResult {
  inventoryImported: number;
  goalsImported: number;
  unresolved: Array<{ section: "inventory" | "goals"; index: number; name: string; reason: "missing" | "ambiguous" }>;
}

export function ProfileTransfer() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setError(false);
    const form = new FormData(event.currentTarget);
    const file = form.get("profile");
    if (!(file instanceof File) || !file.size) {
      setError(true); setMessage("Choose a profile JSON file."); setPending(false); return;
    }
    const mode = form.get("mode") === "replace" ? "replace" : "merge";
    const response = await fetch(`/api/profile/import?mode=${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: await file.text() });
    const result = await response.json().catch(() => ({})) as ImportResult & { message?: string };
    if (!response.ok) {
      setError(true); setMessage(result.message ?? "Import failed."); setPending(false); return;
    }
    setMessage(`Imported ${result.inventoryImported} inventory entr${result.inventoryImported === 1 ? "y" : "ies"} and ${result.goalsImported} goal${result.goalsImported === 1 ? "" : "s"}.${result.unresolved.length ? ` ${result.unresolved.length} could not be matched: ${result.unresolved.map((entry) => entry.name).join(", ")}.` : ""}`);
    setPending(false);
    router.refresh();
  }

  return <section className="card profile-transfer">
    <h2>Move or back up this profile</h2>
    <p className="muted">Exports use provider identifiers so they can resolve against a different Ordis Prime installation.</p>
    <a className="button" href="/api/profile/export" download>Export JSON</a>
    <form className="form-stack" onSubmit={submit}>
      <label>Profile JSON<input name="profile" type="file" accept="application/json,.json" required /></label>
      <label>Import behavior<select name="mode" defaultValue="merge"><option value="merge">Merge with current inventory</option><option value="replace">Replace current inventory</option></select></label>
      <button className="button" disabled={pending}>{pending ? "Importing…" : "Import profile"}</button>
      {message && <p className={error ? "error" : "success"} role="status">{message}</p>}
    </form>
  </section>;
}
