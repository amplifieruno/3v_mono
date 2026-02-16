FROM bluenviron/mediamtx:latest AS mediamtx
FROM alpine:3.19
RUN apk add --no-cache ffmpeg
COPY --from=mediamtx /mediamtx /mediamtx
ENTRYPOINT ["/mediamtx"]
