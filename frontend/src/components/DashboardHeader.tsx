export function DashboardHeader() {
  return (
    <header className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-accent">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        Operaciones · Multitienda
      </div>
      <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
        Dashboard de órdenes VTEX
      </h1>
      <p className="max-w-2xl text-sm text-ink-muted">
        Consolidado de Pilatos, Kipling, Diesel, Superdry, Girbaud y Replay para el rango de
        fechas seleccionado.
      </p>
    </header>
  );
}
