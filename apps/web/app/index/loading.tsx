export default function IndexLoading() {
  return (
    <section className="index-loading" role="status" aria-live="polite">
      <span className="index-spinner" aria-hidden="true" />
      <div>
        <p className="eyebrow">The Index</p>
        <strong>Calculating market intelligence…</strong>
        <p className="muted">Sorting relics, Syndicate offers, and Arcanes.</p>
      </div>
    </section>
  );
}
