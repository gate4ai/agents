FROM node:20-alpine AS base

WORKDIR /app

COPY package*.json ./

RUN npm ci && npm cache clean --force

FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:20-alpine AS production

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nuxt -u 1001

WORKDIR /app

COPY --from=base /app/node_modules ./node_modules

COPY --from=build /app/.output ./.output
COPY --from=build /app/package*.json ./

RUN mkdir -p /app/data /app/logs && \
    chown -R nuxt:nodejs /app

USER nuxt

EXPOSE 3000

ENV NODE_ENV=production
ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3000
ENV DB_FILE_NAME=/app/data/gate4ai.db

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", ".output/server/index.mjs"] 