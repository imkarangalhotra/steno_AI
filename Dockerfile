FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3200
WORKDIR /app
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node public ./public
USER node
EXPOSE 3200
CMD ["node", "server.mjs"]
