# Container image for the dashboard.
#
# Not the deployment path — the app runs on Vercel — but it is the escape hatch
# if that ever changes, so it should actually build. It did not: the runner
# stage copies .next/standalone, which Next only emits when it is asked to, and
# next.config.js never sets `output: 'standalone'`. Every `docker build` failed
# on the COPY.
#
# The flag below is what asks for it. It is set here rather than in
# next.config.js on purpose: adding `output` to the config would change the
# Vercel build too, and there is no reason to alter a deployment that works for
# the sake of an image nobody currently runs.
#
# Requires a .dockerignore — without it the builder's `COPY . .` bakes web/.env
# into an image layer, where it survives even if a later stage removes it.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Emit the self-contained server bundle the runner stage expects.
ENV NEXT_PRIVATE_STANDALONE true
# `npm run build` runs `prisma generate` first, which needs the schema; it is
# copied above and needs no database connection at build time.
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production

# Next does not trace these two into the standalone output, so they are copied
# alongside it: public assets, and the hashed client bundles.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Don't run the server as root.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 && chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME 0.0.0.0

CMD ["node", "server.js"]
