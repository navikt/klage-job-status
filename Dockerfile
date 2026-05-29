FROM cgr.dev/chainguard/glibc-dynamic:latest@sha256:0dc86136587f0ac15d61d307dcd8193e4a9880d26d2f2659b9e2b142640eecc0

WORKDIR /usr/src/klage-job-status

COPY api/dist/api .
COPY app/dist/index.html .

CMD ["./api"]
EXPOSE 8080
