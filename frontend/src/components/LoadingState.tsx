interface LoadingStateProps {
  storeNames: string[];
}

/**
 * Estado de carga mientras se consultan las tiendas. VTEX se consulta en
 * paralelo controlado por lo que no se puede reportar avance real
 * página a página desde el frontend; en su lugar se comunica con claridad
 * que la consulta está en curso para las seis tiendas a la vez.
 */
export function LoadingState({ storeNames }: LoadingStateProps) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-panel p-6 shadow-panel">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
        <p className="text-sm font-medium text-ink">Consultando órdenes…</p>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {storeNames.map((name) => (
          <li
            key={name}
            className="flex items-center gap-2 rounded-xl border border-surface-border bg-surface px-3 py-2 text-sm text-ink-muted"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
