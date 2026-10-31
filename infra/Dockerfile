FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci
COPY . .
# Generating/building does not connect to the database.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build
RUN mkdir -p /app/var/uploads && chown -R node:node /app
USER node
EXPOSE 3001
CMD ["npm", "start"]
