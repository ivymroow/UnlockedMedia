FROM node:22-bookworm-slim

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
COPY vendor/ ./vendor/
RUN npm ci --omit=dev
COPY . .

EXPOSE 3000
CMD ["node", "server/index.js"]
