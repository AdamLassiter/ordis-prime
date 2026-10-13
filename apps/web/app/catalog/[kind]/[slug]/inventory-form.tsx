import type { PlayerInventoryEntry } from "@ordis-prime/db";
import { updateInventory } from "./inventory-action";

export function InventoryForm({ item }: { item: PlayerInventoryEntry }) {
  const action = updateInventory.bind(null, item.kind, item.slug);
  return <section className="card inventory-editor">
    <h2>Your inventory</h2>
    <form className="form-stack" action={action}>
      <div className="count-grid">
        <label>Owned<input name="ownedCount" type="number" min="0" step="1" required defaultValue={item.ownedCount} /></label>
        <label>Built<input name="builtCount" type="number" min="0" step="1" required defaultValue={item.builtCount} /></label>
        <label>Wanted<input name="wantedCount" type="number" min="0" step="1" required defaultValue={item.wantedCount} /></label>
      </div>
      <div className="count-grid">
        <label>Mastered<select name="mastered" defaultValue={toSelectValue(item.mastered)}><option value="unknown">Not recorded</option><option value="yes">Yes</option><option value="no">No</option></select></label>
        <label>Subsumed<select name="subsumed" defaultValue={toSelectValue(item.subsumed)}><option value="unknown">Not recorded</option><option value="yes">Yes</option><option value="no">No</option></select></label>
      </div>
      <label>Notes<textarea name="note" maxLength={2000} defaultValue={item.note} rows={3} /></label>
      <button className="button">Save inventory</button>
    </form>
  </section>;
}

function toSelectValue(value: boolean | undefined) {
  return value === undefined ? "unknown" : value ? "yes" : "no";
}
