import type { NodeCompletionState } from "@ordis-prime/db";
import { updateNodeCompletion } from "./actions";

export function NodeCompletionForm({
  slug,
  normalState,
  steelPathState,
}: {
  slug: string;
  normalState: NodeCompletionState;
  steelPathState: NodeCompletionState;
}) {
  return (
    <form
      className="inline-form discovery-progress"
      action={updateNodeCompletion.bind(null, slug)}
    >
      <label>
        Normal
        <select name="normalState" defaultValue={normalState}>
          <option value="incomplete">Incomplete</option>
          <option value="completed">Completed</option>
        </select>
      </label>
      <label>
        Steel Path
        <select name="steelPathState" defaultValue={steelPathState}>
          <option value="incomplete">Incomplete</option>
          <option value="completed">Completed</option>
        </select>
      </label>
      <button className="button">Save</button>
    </form>
  );
}
