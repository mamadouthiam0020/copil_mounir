# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci
COPY client ./client
COPY server ./server
RUN npm run build -w client \
 && npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    APP_ENV=production \
    PORT=4000
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist

# Les secrets et l'URI MongoDB sont fournis via --env-file ou un orchestrateur.
EXPOSE 4000
USER node
CMD ["npm", "start"]
