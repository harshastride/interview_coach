# Stage 1: Build frontend
FROM node:22-alpine AS builder
WORKDIR /app
ARG GEMINI_API_KEY
ENV GEMINI_API_KEY=${GEMINI_API_KEY}
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
COPY src/constants.ts src/termData.ts ./src/
COPY tsconfig.json ./
RUN mkdir -p audio_cache

EXPOSE 3000
ENV NODE_ENV=production
CMD ["npx", "tsx", "server.ts"]
