# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /repo

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w packages/shared
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build -w apps/web

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodegrp && adduser -S nodeusr -G nodegrp

COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/public ./apps/web/public
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static

USER nodeusr
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "require('http').get('http://localhost:3000/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
