# Dedicated Railway service for the Verification API+dashboard.
# Never attach this build to the existing Noetfield monorepo's platform-api service.
FROM oven/bun:1.3 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# Generate the *PostgreSQL* Prisma client before bundling Next.js.
RUN cp prisma/schema.postgres.prisma prisma/schema.prisma
RUN bunx prisma generate
ENV DATABASE_URL=postgresql://builder:placeholder@localhost:5432/build
ENV NODE_ENV=production
RUN bun run build

FROM oven/bun:1.3-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["bun", "server.js"]
