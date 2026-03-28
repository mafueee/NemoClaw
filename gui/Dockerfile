FROM node:22-alpine

WORKDIR /app

# Copy GUI package and install dependencies
COPY gui/package.json gui/package-lock.json* ./gui/
RUN cd gui && npm install --production

# Copy bin/lib (CLI orchestration layer)
COPY bin/ ./bin/
COPY nemoclaw-blueprint/ ./nemoclaw-blueprint/
COPY scripts/ ./scripts/
COPY package.json ./

# Install root yaml dependency
RUN npm install --production

# Copy GUI server and public assets
COPY gui/server/ ./gui/server/
COPY gui/public/ ./gui/public/

EXPOSE 3000

ENV GUI_PORT=3000
ENV NODE_ENV=production

CMD ["node", "gui/server/index.js"]
