# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json .sequelizerc ./
COPY src ./src
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache curl

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
# Migrations/seeds are run with tsx/sequelize-cli from source in CI or by an
# operator; the compiled JS migrations are copied for `npm run db:migrate`.
COPY .sequelizerc ./
COPY src/config/sequelize-cli.js ./src/config/sequelize-cli.js
COPY src/migrations ./src/migrations

USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -fsS http://localhost:5000/api/health || exit 1

CMD ["node", "dist/server.js"]
