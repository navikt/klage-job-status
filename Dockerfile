FROM europe-north1-docker.pkg.dev/cgr-nav/pull-through/nav.no/node:25-slim@sha256:fe95e07fb6f7b5cd3e74c4d25ecbea5a965e84a7054fe282835dd87ff3030977

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
