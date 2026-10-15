import { updateGoal } from "./actions";

export function GoalForm({
  kind,
  slug,
  targetQuantity,
  compact = false,
}: {
  kind: string;
  slug: string;
  targetQuantity: number;
  compact?: boolean;
}) {
  const action = updateGoal.bind(null, kind, slug);
  return (
    <form className={compact ? "inline-form" : "form-stack"} action={action}>
      <label>
        Target quantity
        <input
          name="targetQuantity"
          type="number"
          min="0"
          step="1"
          required
          defaultValue={targetQuantity}
          aria-label="Target quantity"
        />
      </label>
      <button className="button">
        {targetQuantity ? "Update goal" : "Add goal"}
      </button>
      {targetQuantity > 0 && <span className="muted">Set to 0 to remove.</span>}
    </form>
  );
}
