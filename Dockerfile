FROM cgr.dev/chainguard/glibc-dynamic:latest@sha256:d7aa809c1ae88f97cd727d6f5f91e4edab579a14f86f52fd0dd8c658c854286d

WORKDIR /usr/src/klage-job-status

COPY api/dist/api .
COPY app/dist/index.html .

CMD ["./api"]
EXPOSE 8080
