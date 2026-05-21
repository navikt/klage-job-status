FROM cgr.dev/chainguard/glibc-dynamic:latest@sha256:1abac9d143e7178d2928dfff97f62f27194e25dada6ba72ed4698b74d33296d3

WORKDIR /usr/src/klage-job-status

COPY api/dist/api .
COPY app/dist/index.html .

CMD ["./api"]
EXPOSE 8080
