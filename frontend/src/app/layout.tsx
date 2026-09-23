import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'VICA — Ventas Integradas para Consolidación y Análisis',
  description:
    'Consolidado de órdenes multitienda VTEX: Pilatos, Kipling, Diesel, Superdry, Girbaud y Replay.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans text-ink">
        <Navbar />
        {children}
      </body>
    </html>
  );
}
