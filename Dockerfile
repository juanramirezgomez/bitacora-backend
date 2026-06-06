# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS runtime

ARG MONGODB_MAJOR=8.0

ENV NODE_ENV=production \
    PORT=4000 \
    BACKUP_DIR=/var/data/backups \
    MONGODUMP_PATH=/usr/bin/mongodump \
    MONGORESTORE_PATH=/usr/bin/mongorestore

WORKDIR /app

# MongoDB Database Tools are external binaries; install them from MongoDB's
# official Debian repository and fail the image build if either tool is absent.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
    && curl -fsSL "https://pgp.mongodb.com/server-${MONGODB_MAJOR}.asc" \
      | gpg --dearmor -o /usr/share/keyrings/mongodb-server.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/mongodb-server.gpg] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/${MONGODB_MAJOR} main" \
      > /etc/apt/sources.list.d/mongodb-org.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends mongodb-database-tools \
    && mongodump --version \
    && mongorestore --version \
    && apt-get purge -y --auto-remove curl gnupg \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY --chown=node:node src ./src

RUN mkdir -p /var/data/backups \
    && chown -R node:node /var/data /app

USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["npm", "start"]
