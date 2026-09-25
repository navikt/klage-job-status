FROM europe-north1-docker.pkg.dev/cgr-nav/pull-through/nav.no/node:26-slim@sha256:375cd0b3cf78050ac7a1e89f1b0be4d30ff1b3d170557268c6fd5d3685db9e6e

WORKDIR /app

ENV NODE_ENV=production
# Disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Bind to all interfaces. Without this, Next reads the pod name from $HOSTNAME in Kubernetes and fails to bind.
ENV HOSTNAME=0.0.0.0

# Prebuilt standalone server + traced node_modules.
COPY .next/standalone ./
# Static assets are not part of the standalone bundle; copy them alongside the server.
COPY .next/static ./.next/static

EXPOSE 3000

# The base image's entrypoint is `node`; pass the server path as its argument.
CMD ["server.js"]
