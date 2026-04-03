FROM cgr.dev/chainguard/glibc-dynamic:latest@sha256:e9a3236ebb746bbab93bda4ca842e55a6aaea2c812a685646043e842e69220be

WORKDIR /usr/src/klage-job-status

COPY api/dist/api .
COPY app/dist/index.html .

CMD ["./api"]
EXPOSE 8080
