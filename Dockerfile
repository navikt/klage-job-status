FROM cgr.dev/chainguard/glibc-dynamic:latest@sha256:fa0d07a6a352921b778c4da11d889b41d9ef8e99c69bc2ec1f8c9ec46b2462e9

WORKDIR /usr/src/klage-job-status

COPY api/dist/api .
COPY app/dist/index.html .

CMD ["./api"]
EXPOSE 8080
