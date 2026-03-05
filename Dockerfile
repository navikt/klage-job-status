FROM cgr.dev/chainguard/glibc-dynamic:latest@sha256:32a62ef6ed1a741a7e764ec7b049da6a844699e0d51004bf1cb532ebb7479d8c

WORKDIR /usr/src/klage-job-status

COPY api/dist/api .
COPY app/dist/index.html .

CMD ["./api"]
EXPOSE 8080
