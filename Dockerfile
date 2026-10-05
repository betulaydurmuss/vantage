FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production \
    VANTAGE_LISTEN=0.0.0.0:7070 \
    VANTAGE_DATA=/data/data.json
WORKDIR /app
RUN adduser -D -u 10001 vantage && mkdir /data && chown vantage /data
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/bin ./bin
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist
USER vantage
VOLUME /data
EXPOSE 7070
ENTRYPOINT ["node", "/app/bin/vantage.js"]
CMD ["serve"]
