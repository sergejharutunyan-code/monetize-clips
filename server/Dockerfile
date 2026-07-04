# ClipForge backend — Node 22 (built-in SQLite, no native build).
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV PORT=8787
EXPOSE 8787

# Persist the SQLite DB by mounting a volume at /app/data.
VOLUME ["/app/data"]

CMD ["npm", "start"]
