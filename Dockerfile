FROM node:24-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3200 DICTIONARY_PATH=/data/steno.sqlite
WORKDIR /app
COPY --chown=node:node package.json server.mjs dictionary.mjs ./
COPY --chown=node:node public ./public
EXPOSE 3200
# Initialize the mounted directory, then run the application without root privileges.
CMD ["sh", "-c", "mkdir -p /data && chown node:node /data && exec su node -s /bin/sh -c 'exec node server.mjs'"]
