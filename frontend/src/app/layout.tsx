import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dashboard de órdenes VTEX',
  description:
    'Consolidado de órdenes multitienda VTEX: Pilatos, Kipling, Diesel, Superdry, Girbaud y Replay.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans text-ink">{children}</body>
    </html>
  );
}
