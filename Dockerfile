FROM cgr.dev/chainguard/glibc-dynamic:latest@sha256:7d80ca581f4c1e427ca4043aec584ad36dfafb2bc9ca9df80fbb730cee1b3db7

WORKDIR /usr/src/klage-job-status

COPY api/dist/api .
COPY app/dist/index.html .

CMD ["./api"]
EXPOSE 8080
