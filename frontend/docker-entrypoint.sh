#!/bin/sh
# Render the server block into a writable directory and start nginx.
#
# /etc/nginx is read-only for an unprivileged user and the stock nginx image
# wants to write its pid file and temp files under /var, so the whole runtime
# state lives in /tmp. Only ${BACKEND_UPSTREAM} is substituted; nginx's own
# $variables are left alone.
set -eu

# Hosts may pass a declared variable through as an empty string, which would
# leave nginx with a `set ... ;` it cannot parse.
upstream="${BACKEND_UPSTREAM:-http://backend:8000}"
# Drop trailing slashes: proxy_pass adds the request URI itself.
upstream=$(printf '%s' "$upstream" | sed 's|/*$||')
export BACKEND_UPSTREAM="$upstream"

mkdir -p /tmp/nginx/conf \
    /tmp/client_temp /tmp/proxy_temp /tmp/fastcgi_temp \
    /tmp/uwsgi_temp /tmp/scgi_temp

envsubst '${BACKEND_UPSTREAM}' \
    < /etc/nginx/templates/default.conf.template \
    > /tmp/nginx/conf/default.conf

exec nginx -g 'daemon off;'
