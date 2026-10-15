import type { DiscoveryProgressState } from "@ordis-prime/db";
import { updateDiscoveryProgress } from "./actions";

export function DiscoveryProgressForm({
  kind,
  slug,
  state,
}: {
  kind: string;
  slug: string;
  state: DiscoveryProgressState;
}) {
  return (
    <form
      className="inline-form discovery-progress"
      action={updateDiscoveryProgress.bind(null, kind, slug)}
    >
      <label>
        Your progress
        <select name="state" defaultValue={state}>
          <option value="unseen">Unseen</option>
          <option value="discovered">Discovered</option>
          <option value="completed">Completed</option>
        </select>
      </label>
      <button className="button">Save</button>
    </form>
  );
}
