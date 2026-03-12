FROM oven/bun:1.3.5

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY tsconfig.json ./

# data/ volume is mounted at runtime — don't bake the DB into the image
VOLUME ["/app/data"]

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "src/index.ts"]
