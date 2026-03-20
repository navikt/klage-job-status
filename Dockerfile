FROM cgr.dev/chainguard/glibc-dynamic:latest@sha256:4fd32c47d5d83cb2bc5045f6d2a76458fb3a68c148ddc32841e452df5afe0279

WORKDIR /usr/src/klage-job-status

COPY api/dist/api .
COPY app/dist/index.html .

CMD ["./api"]
EXPOSE 8080
