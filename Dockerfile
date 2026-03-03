FROM cgr.dev/chainguard/glibc-dynamic:latest@sha256:43213d6f7b75a4f32ef3070bf395f8001c62e2a20112f2e2d656d82d9f505170

WORKDIR /usr/src/klage-job-status

COPY api/dist/api .
COPY app/dist/index.html .

CMD ["./api"]
EXPOSE 8080
