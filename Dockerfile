FROM cgr.dev/chainguard/glibc-dynamic:latest@sha256:ea9eab0adc5716fb9937ab60155a31bce9cbc8b56e6f2e21fb9af9218be195b7

WORKDIR /usr/src/klage-job-status

COPY api/dist/api .
COPY app/dist/index.html .

CMD ["./api"]
EXPOSE 8080
