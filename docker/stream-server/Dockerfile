# Stage 1: Segment videos
FROM alpine:3.21 AS prepare
RUN apk add --no-cache ffmpeg bash jq
COPY videos/ /input/
COPY prepare-videos.sh /prepare-videos.sh
RUN chmod +x /prepare-videos.sh && /prepare-videos.sh

# Stage 2: Runtime — OpenResty serves static + Lua
FROM openresty/openresty:alpine

# Copy prepared videos
COPY --from=prepare /videos /videos

# Copy nginx config and Lua scripts
COPY nginx.conf /usr/local/openresty/nginx/conf/nginx.conf
COPY lua/ /usr/local/openresty/nginx/lua/

EXPOSE 8888

CMD ["/usr/local/openresty/bin/openresty", "-g", "daemon off;"]
