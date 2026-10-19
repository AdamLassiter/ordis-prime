import type { NodeCompletionState } from "@ordis-prime/db";
import { updateNodeCompletion } from "./actions";

export function NodeCompletionForm({
  slug,
  state,
}: {
  slug: string;
  state: NodeCompletionState;
}) {
  return (
    <form
      className="inline-form discovery-progress"
      action={updateNodeCompletion.bind(null, slug)}
    >
      <label>
        Your node progress
        <select name="state" defaultValue={state}>
          <option value="incomplete">Incomplete</option>
          <option value="completed">Completed</option>
        </select>
      </label>
      <button className="button">Save</button>
    </form>
  );
}
