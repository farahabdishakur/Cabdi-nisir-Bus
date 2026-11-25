FROM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
RUN npm ci
COPY . .
# rewrites-ka /api/v1 → backend waxaa la qoraa marka la build-gareeyo
ARG API_URL=http://localhost:3000
ENV API_URL=$API_URL
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY next.config.mjs ./
EXPOSE 3001
CMD ["npx", "next", "start", "-p", "3001"]
