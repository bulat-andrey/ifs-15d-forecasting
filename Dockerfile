FROM node:24-alpine

WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

USER node
ENV HOST=0.0.0.0 PORT=8787
EXPOSE 8787
CMD ["npm", "start"]
