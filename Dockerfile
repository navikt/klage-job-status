FROM cgr.dev/chainguard/glibc-dynamic:latest@sha256:470109ff06cafa56ff55bf1d51e6e2f2f5bdcf2d56692d96b515a193ac3ee5b2

WORKDIR /usr/src/klage-job-status

COPY api/dist/api .
COPY app/dist/index.html .

CMD ["./api"]
EXPOSE 8080
