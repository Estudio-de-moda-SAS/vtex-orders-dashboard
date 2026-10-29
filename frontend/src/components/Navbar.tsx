'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/tendencias', label: 'Tendencias' },
  { href: '/descuentos', label: 'Descuentos' },
  { href: '/metodos-pago', label: 'Métodos de pago' },
  { href: '/pilatos', label: 'Pilatos' },
  { href: '/smartsale', label: 'SmartSale' },
  { href: '/presupuesto', label: 'Presupuesto' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/resumen', label: 'Resumen' },
];

const APP_NAME = 'VICA';
const APP_MEANING = 'Ventas Integradas para Consolidación y Análisis';

/**
 * Navegación compartida entre rutas. `sticky top-0` (con `z-40`, por
 * encima del contenido) para no tener que volver arriba de la página
 * cada vez que se quiere cambiar de sección. Con 6 pestañas, una fila
 * horizontal ya no cabe en una pantalla de celular — por debajo de `md`
 * los links se colapsan detrás de un botón de hamburguesa; de `md` en
 * adelante se ve la fila completa, igual que antes.
 */
export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Cierra el menú móvil al cambiar de ruta — sin esto, quedaría abierto
  // tapando la página recién cargada después de tocar un link.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <nav className="sticky top-0 z-40 border-b border-surface-border bg-surface-panel">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          title={APP_MEANING}
          className="flex shrink-0 flex-col items-start justify-center gap-0.5 py-2 transition hover:opacity-90"
        >
          <Image src="/vica-wordmark.png" alt={APP_NAME} width={108} height={28} className="shrink-0" priority />
          <span className="hidden text-[9px] font-medium uppercase leading-tight tracking-wide text-ink-faint sm:block">
            {APP_MEANING}
          </span>
        </Link>

        {/* Desktop (md en adelante): fila horizontal completa. */}
        <div className="hidden md:flex md:gap-1">
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

        {/* Mobile (debajo de md): botón de hamburguesa. */}
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={mobileOpen}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-muted transition hover:bg-surface md:hidden"
        >
          {mobileOpen ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Menú móvil desplegable — solo existe en el DOM mientras está abierto. */}
      {mobileOpen && (
        <div className="border-t border-surface-border bg-surface-panel px-4 py-2 sm:px-6 md:hidden">
          <div className="flex flex-col gap-0.5 py-2">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? 'bg-accent/10 text-accent' : 'text-ink-muted hover:bg-surface hover:text-ink'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
