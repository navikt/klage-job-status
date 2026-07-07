FROM cgr.dev/chainguard/glibc-dynamic:latest@sha256:3a532dd007768919cfc735669d19df72e0351dc09b1c377f57e30745a57879f0

WORKDIR /usr/src/klage-job-status

COPY api/dist/api .
COPY app/dist/index.html .

CMD ["./api"]
EXPOSE 8080
