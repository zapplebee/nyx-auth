FROM oven/bun:1.3.5

WORKDIR /app

COPY package.json bun.lock* ./
# --ignore-scripts skips the better-sqlite3 node-gyp build; bun provides
# a built-in compatible SQLite implementation at runtime (bun:sqlite).
RUN bun install --frozen-lockfile --ignore-scripts

COPY src ./src
COPY tsconfig.json ./

# data/ volume is mounted at runtime — don't bake the DB into the image
VOLUME ["/app/data"]

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "src/index.ts"]
