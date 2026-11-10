FROM node:26.13.0-alpine
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci && chown -R node:node /app
COPY --chown=node:node frontend/ ./
USER node
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--port", "5173", "--strictPort"]
