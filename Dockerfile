FROM cgr.dev/chainguard/glibc-dynamic:latest@sha256:22bdf20a414970c48bead807f32ca833125cfe477d0b4f66f8d1d10d48c6b434

WORKDIR /usr/src/klage-job-status

COPY api/dist/api .
COPY app/dist/index.html .

CMD ["./api"]
EXPOSE 8080
