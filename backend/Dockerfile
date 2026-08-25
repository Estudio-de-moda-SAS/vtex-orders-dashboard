FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
# Carpeta donde vive el caché histórico SQLite (node:sqlite, sin
# dependencias nativas externas). Debe montarse como volumen persistente
# (ver docker-compose.yml) para no perder el histórico ya sincronizado en
# cada redeploy.
RUN mkdir -p /app/data
EXPOSE 3001
CMD ["node", "dist/main.js"]
