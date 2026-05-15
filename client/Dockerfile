# Next.js client — multi-stage production image.
#
# Why 3 stages:
#   1. `deps`     : install node_modules with yarn (full tree, no source)
#   2. `builder`  : copy source + run `yarn build`; emits .next/standalone
#                   + .next/static via next.config.mjs `output: "standalone"`
#   3. `runner`   : minimal alpine + node 22, copies only the artifacts
#                   from `builder`; final image ~150MB instead of 1GB.
#
# Build:   docker build -t fn-client client/
# Run:     docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=https://your-domain.tld/api fn-client
#
# NEXT_PUBLIC_API_URL is BAKED into the bundle at build time — pass it via
# --build-arg if you want a non-default value. Default points to /api on
# the same origin so Caddy can reverse-proxy /api/* to gateway:3001.

FROM node:22-alpine AS deps
WORKDIR /app
COPY client/package.json client/yarn.lock ./
# `--frozen-lockfile` aborts the build if yarn.lock would change; ensures
# repeatable images across CI runs.
RUN yarn install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY client/ ./
RUN yarn build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root user — Next standalone runs fine as nobody.
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs nextjs

# Copy the standalone bundle (includes the trimmed node_modules + server.js)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Static assets are not in standalone by design; mount them next to it.
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# server.js is the entrypoint emitted by Next's standalone output.
CMD ["node", "server.js"]
