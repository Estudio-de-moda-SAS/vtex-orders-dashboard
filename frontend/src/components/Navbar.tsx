'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/tendencias', label: 'Tendencias' },
  { href: '/descuentos', label: 'Descuentos' },
  { href: '/pilatos', label: 'Pilatos' },
];

const APP_NAME = 'VICA';
const APP_MEANING = 'Ventas Integradas para Consolidación y Análisis';

/**
 * Navegación compartida entre rutas (dashboard operativo vs. módulos de
 * analítica separados, ver documento de planeación del módulo
 * comparativo). Se agregan más pestañas acá a medida que se construye
 * cada ruta nueva (`/ciudades`, `/productos`, `/pilatos`) — no antes,
 * para no mostrar links a páginas que todavía no existen.
 */
export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-surface-border bg-surface-panel">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          title={APP_MEANING}
          className="flex items-center gap-2.5 py-3 transition hover:opacity-90"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent via-[#5B6FE0] to-[#8B5CF6] font-display text-base font-bold text-white shadow-panel">
            V
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-lg font-extrabold tracking-tight text-ink">{APP_NAME}</span>
            <span className="hidden text-[10px] font-medium uppercase tracking-wide text-ink-faint sm:block">
              {APP_MEANING}
            </span>
          </span>
        </Link>

        <div className="flex gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`border-b-2 px-3 py-3 text-sm font-medium transition ${
                  isActive
                    ? 'border-accent text-accent'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
