# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /repo
RUN apk add --no-cache openssl

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w packages/shared
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
RUN npm run build -w apps/api

FROM base AS production-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/prisma apps/api/prisma
RUN npm ci --omit=dev
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

FROM node:20-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production
RUN apk add --no-cache openssl && addgroup -S nodegrp && adduser -S nodeusr -G nodegrp

COPY --from=production-deps /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json

USER nodeusr
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "require('http').get('http://localhost:3001/api/v1/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "apps/api/dist/src/main.js"]
