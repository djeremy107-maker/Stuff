FROM node:22-slim

# better-sqlite3 ships prebuilt binaries; build tools are a safe fallback.
RUN apt-get update && apt-get install -y --no-install-recommends python3 build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=3000
ENV DB_PATH=/data/game.sqlite
EXPOSE 3000

# Mount a volume at /data so the save persists across deploys.
VOLUME ["/data"]

CMD ["npm", "start"]
