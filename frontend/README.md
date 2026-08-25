# Frontend — Dashboard de órdenes VTEX (Next.js)

Ver el README raíz del proyecto para la documentación completa. Resumen rápido:

```bash
npm install
cp .env.local.example .env.local   # opcional, ajustar si el backend no corre en localhost:3001
npm run dev
```

Este frontend solo se comunica con el backend propio (`NEXT_PUBLIC_API_BASE_URL`).
Nunca llama directamente a VTEX ni maneja credenciales de VTEX.
