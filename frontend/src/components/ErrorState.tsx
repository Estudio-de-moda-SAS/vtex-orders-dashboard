interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-6">
      <p className="text-sm font-medium text-danger">No fue posible completar la consulta</p>
      <p className="text-sm text-ink-muted">{message}</p>
      <button
        onClick={onRetry}
        className="rounded-xl border border-danger/40 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/15"
      >
        Reintentar
      </button>
    </div>
  );
}
