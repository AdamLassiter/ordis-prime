export default function AppLoading() {
  return (
    <section className="page-loading" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <div>
        <p className="eyebrow">Ordis Prime</p>
        <strong>Compiling mission intelligence…</strong>
        <p className="muted">One moment, Operator.</p>
      </div>
    </section>
  );
}
