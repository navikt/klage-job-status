FROM oven/bun:1.2.13-alpine

ENV NODE_ENV=production

WORKDIR /usr/src/klage-job-status

COPY package.json package.json
COPY tsconfig.json tsconfig.json
COPY node_modules node_modules
COPY api api
COPY app/dist api/public
COPY common common

CMD ["bun", "run", "api"]
EXPOSE 8080
