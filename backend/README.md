# Backend — Dashboard de órdenes VTEX (NestJS)

Ver el README raíz del proyecto para la documentación completa. Resumen rápido:

```bash
npm install
cp .env.example .env   # completar credenciales reales
npm run start:dev
```

Endpoints:

- `GET /api/stores`
- `GET /api/orders/dashboard?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`

El backend es el único componente autorizado a comunicarse con VTEX. Las
credenciales viven exclusivamente en `.env` y nunca se registran en logs ni
se envían al frontend.
