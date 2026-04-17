# Stage 1: Build frontend
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Production runtime
FROM node:22-alpine AS runner
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY --from=builder /app/dist ./dist
COPY server.ts ./
COPY src/constants.ts ./src/
COPY src/server/ ./src/server/
COPY tsconfig.json ./

EXPOSE 3000
ENV NODE_ENV=production
CMD ["npx", "tsx", "server.ts"]
