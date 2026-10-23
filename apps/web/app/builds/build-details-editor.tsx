import { AutoSaveForm } from "../auto-save-form";

export function BuildDetailsEditor({
  action,
  title,
  category,
  notes,
}: {
  action: (formData: FormData) => Promise<void>;
  title: string;
  category?: string;
  notes?: string;
}) {
  return (
    <AutoSaveForm action={action} className="build-inline-details">
      <label className="build-inline-title">
        <span className="sr-only">Build title</span>
        <input
          aria-label="Build title"
          name="title"
          required
          maxLength={160}
          defaultValue={title}
        />
      </label>
      <label className="build-inline-category">
        <span className="sr-only">Build category</span>
        <input
          aria-label="Build category"
          name="category"
          maxLength={80}
          defaultValue={category}
          placeholder="Add category"
        />
      </label>
      <label className="build-inline-notes">
        <span>Notes</span>
        <textarea
          name="notes"
          maxLength={10000}
          rows={3}
          defaultValue={notes}
          placeholder="Add build notes, substitutions, or usage guidance"
        />
      </label>
    </AutoSaveForm>
  );
}
