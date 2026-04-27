FROM cgr.dev/chainguard/glibc-dynamic:latest@sha256:f85add3add56b070e890089bdf948212715da181a396bf9dd163b088988fbcd2

WORKDIR /usr/src/klage-job-status

COPY api/dist/api .
COPY app/dist/index.html .

CMD ["./api"]
EXPOSE 8080
