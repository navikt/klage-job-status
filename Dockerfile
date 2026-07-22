FROM cgr.dev/chainguard/glibc-dynamic:latest@sha256:7ff79e2caef2b8a137ddaf9940fb790e91148482092363760d6661e4591fd54c

WORKDIR /usr/src/klage-job-status

COPY api/dist/api .
COPY app/dist/index.html .

CMD ["./api"]
EXPOSE 8080
