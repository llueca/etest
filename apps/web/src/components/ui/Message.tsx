/** Full-page message for loading, error and configuration states, with an optional retry. */
export function Message({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <main className="message">
      <h1>{title}</h1>
      {detail && <p>{detail}</p>}
      {onRetry && (
        <button type="button" className="btn btn-quiet" onClick={onRetry}>
          Retry
        </button>
      )}
    </main>
  );
}
