'use client';

import { useState } from 'react';

/**
 * Botón + modal con el detalle completo de las fórmulas del semáforo —
 * vive aparte de la caja resumen de `/resumen/page.tsx` para no saturarla;
 * esto es para quien quiera entender (o explicarle a alguien más) EXACTAMENTE
 * de dónde sale cada número.
 */
export function ResumenFormulaModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-accent hover:underline">
        Ver el detalle completo de las fórmulas →
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full w-full max-w-2xl flex-col rounded-2xl border border-surface-border bg-surface-panel shadow-panel"
          >
            <div className="flex items-center justify-between border-b border-surface-border px-6 py-4">
              <h2 className="font-display text-base font-semibold text-ink">Cómo se calcula el color de cada tienda</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-ink-faint hover:text-ink" aria-label="Cerrar">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 text-sm text-ink-muted">
              <section className="mb-5">
                <h3 className="mb-1.5 font-semibold text-ink">1. La variación de ventas</h3>
                <p>
                  Se suman las ventas contabilizadas de todos los días del Rango A y, aparte, las del Rango B (solo
                  los estados que cuentan como venta real, sin cancelaciones ni devoluciones).
                </p>
                <p className="mt-1 rounded-lg bg-surface px-3 py-2 font-mono text-xs text-ink">
                  Δventas% = (ventasA − ventasB) ÷ ventasB × 100
                </p>
              </section>

              <section className="mb-5">
                <h3 className="mb-1.5 font-semibold text-ink">2. "Lo normal" para esa tienda (límites verde/rojo)</h3>
                <p>
                  No se usa el mismo % para todas las tiendas — una tienda que de por sí varía mucho mes a mes
                  necesita un cambio más grande para que cuente como "fuera de lo normal" que una tienda estable.
                </p>
                <p className="mt-2">
                  Para eso se miran hasta <strong>13 ventanas históricas hacia atrás</strong>: cada una tiene la{' '}
                  <strong>misma duración que tu Rango B</strong> (si B son 7 días, cada ventana son 7 días; si B es un
                  mes, cada ventana es un mes), empezando justo en B y yendo hacia atrás sin saltarse ni solapar
                  fechas. El Rango A nunca entra aquí, para que el umbral no se calcule con el mismo dato que se está
                  juzgando.
                </p>
                <p className="mt-2">Con las ventas de esas ventanas se calculan los % de cambio entre cada una y la siguiente más vieja, y de ahí sale σ (la variación típica de esa tienda):</p>
                <p className="mt-1 rounded-lg bg-surface px-3 py-2 font-mono text-xs text-ink">
                  σ = 1,4826 × mediana( |cada cambio − mediana de los cambios| )
                </p>
                <p className="mt-1 text-xs">
                  El <strong>1,4826</strong> es una constante estadística estándar que hace que este cálculo (MAD, o
                  "desviación mediana absoluta") se comporte parecido a una desviación estándar normal, pero sin que
                  un solo mes atípico (ej. un Black Friday) lo distorsione — usa medianas, no promedios.
                </p>
                <p className="mt-2 rounded-lg bg-surface px-3 py-2 font-mono text-xs text-ink">
                  límite verde = máximo(10%, 1,5 × σ)
                  <br />
                  límite rojo = −máximo(5%, 1,5 × σ)
                </p>
                <p className="mt-1 text-xs">
                  <strong>10% / 5%</strong> son los pisos mínimos — nunca se exige menos que eso, aunque la tienda sea
                  súper estable. El <strong>1,5</strong> (la "k") es cuánto se ensancha el límite según esa
                  variación típica: a más σ, más grande tiene que ser el cambio para contar como real.
                </p>
                <p className="mt-2">
                  Si hay menos de 6 cambios históricos disponibles (ventanas insuficientes), no se calcula σ — se usan
                  directamente los pisos del 10%/5% y el panel lo marca como <em>"valores por defecto"</em> en vez de{' '}
                  <em>"historial propio"</em>.
                </p>
              </section>

              <section className="mb-5">
                <h3 className="mb-1.5 font-semibold text-ink">3. ¿Y si elijo un rango grande, como 1 mes?</h3>
                <p>
                  Ahí es donde hay que tener cuidado: 13 ventanas de 1 mes alcanzan casi <strong>13 meses hacia
                  atrás</strong>. Si tu tienda tiene ventas desde julio de 2025, una ventana que caiga antes de esa
                  fecha simplemente no tiene de dónde sacar un número completo.
                </p>
                <p className="mt-2">
                  Por eso el sistema descarta COMPLETA cualquier ventana que empiece antes del primer día con datos
                  reales de esa tienda — no solo las que quedan en cero. (Una ventana a caballo del límite del
                  historial, con datos solo en la mitad de sus días, mostraría un total artificialmente bajo que
                  parecería una caída real sin haberla habido — por eso se descarta entera, no se intenta "rellenar".)
                </p>
                <p className="mt-2">
                  Si después de eso sobreviven muy pocas ventanas, el cálculo cae automáticamente a los valores por
                  defecto (10%/5%, o un mínimo de 30 órdenes) — nunca se inventa un historial que no existe. El
                  número de ventanas realmente usadas (<code className="rounded bg-surface px-1 py-0.5">windowCount</code>) y
                  la fuente (<em>"historial propio"</em> vs. <em>"valores por defecto"</em>) siempre se muestran en
                  el panel "¿Cómo se calculó este color?" de cada tienda, así que nunca queda oculto cuándo el
                  historial no alcanzó.
                </p>
              </section>

              <section>
                <h3 className="mb-1.5 font-semibold text-ink">4. Mínimo de órdenes para opinar (filtro de volumen)</h3>
                <p>Mismo mecanismo de ventanas que arriba, pero contando órdenes en vez de % de cambio de ventas:</p>
                <p className="mt-1 rounded-lg bg-surface px-3 py-2 font-mono text-xs text-ink">
                  mínimo = máximo(10, 0,3 × mediana histórica de órdenes de esa tienda)
                </p>
                <p className="mt-1 text-xs">
                  Si el Rango A o el Rango B tienen MENOS órdenes que ese mínimo, el resultado sale gris — sin
                  importar cuánto cambiaron las ventas, porque no hay suficiente volumen para confiar en el %.
                </p>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
