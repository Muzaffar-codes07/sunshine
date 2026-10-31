FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN chown node:node /app
USER node
COPY --chown=node:node package*.json ./
COPY --chown=node:node apps/api/package.json apps/api/package.json
COPY --chown=node:node apps/web/package.json apps/web/package.json
COPY --chown=node:node packages/contracts/package.json packages/contracts/package.json
RUN npm ci
COPY --chown=node:node . .
# Generating/building does not connect to the database.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build
RUN mkdir -p /app/var/uploads
EXPOSE 3001
CMD ["npm", "start"]
