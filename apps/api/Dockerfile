# ---- build stage ---------------------------------------------------------
FROM node:20.11-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# manifestos primeiro (cache de deps)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile || pnpm install

# código
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm --filter @appgamenews/shared build \
 && pnpm --filter @appgamenews/api prisma:generate \
 && pnpm --filter @appgamenews/api build \
 && pnpm --filter @appgamenews/api --prod deploy /app

# ---- runtime stage ------------------------------------------------------
FROM node:20.11-bookworm-slim AS runtime
ENV NODE_ENV=production
# usuário sem privilégios
RUN useradd --system --uid 10001 --create-home appuser
WORKDIR /app
COPY --from=build --chown=appuser:appuser /app ./
COPY --from=build --chown=appuser:appuser /repo/apps/api/prisma ./prisma
USER appuser
EXPOSE 3000
# healthcheck simples (liveness)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
