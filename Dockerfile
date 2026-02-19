FROM cgr.dev/chainguard/glibc-dynamic:latest@sha256:32e4a9556c591d7a6bfcaf4712d102a943c921c3674a3d07673c8d7cd2e18456

WORKDIR /usr/src/klage-job-status

COPY api/dist/api .
COPY app/dist/index.html .

CMD ["./api"]
EXPOSE 8080
