FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY scripts ./scripts
COPY public ./public
COPY index.html ./index.html
RUN mkdir -p /app/server/data /app/server/data/uploads
EXPOSE 8787
CMD ["node", "server/index.js"]
