FROM node:24.22.2-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24.22.2-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_STOREOPS_EDITION=community
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_STOREOPS_EDITION=$NEXT_PUBLIC_STOREOPS_EDITION
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV STOREOPS_STANDALONE=true
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
# Optional public-only configuration for Cloud builds; private keys stay runtime-only.
RUN --mount=type=secret,id=storeops_public_env,target=/app/.env.production npm run build

FROM node:24.22.2-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ARG NEXT_PUBLIC_STOREOPS_EDITION=community
ENV NEXT_PUBLIC_STOREOPS_EDITION=$NEXT_PUBLIC_STOREOPS_EDITION
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
