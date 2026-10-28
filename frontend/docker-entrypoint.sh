#!/bin/sh
# Render the server block into a writable directory and start nginx.
#
# /etc/nginx is read-only for an unprivileged user and the stock nginx image
# wants to write its pid file and temp files under /var, so the whole runtime
# state lives in /tmp. Only the ${...} placeholders below are substituted;
# nginx's own $variables are left alone.
set -eu

log() {
    # Hosts capture stdout, and this is the first thing that tells you which
    # API address the UI ended up with.
    echo "wind desk ui: $*"
}

# Hosts may pass a declared variable through as an empty string, which would
# leave nginx with a `set ... ;` it cannot parse.
upstream="${BACKEND_UPSTREAM:-}"

if [ -z "$upstream" ]; then
    # The API part is named `backend` in compose, but the host decides which
    # port it runs on (PORT, or the image's EXPOSE). Use whichever answers.
    for port in 8000 8080; do
        if wget -q -O /dev/null -T 2 "http://backend:$port/api/health" 2>/dev/null; then
            upstream="http://backend:$port"
            break
        fi
    done
    upstream="${upstream:-http://backend:8000}"
fi

# Drop trailing slashes: proxy_pass adds the request URI itself.
upstream=$(printf '%s' "$upstream" | sed 's|/*$||')
export BACKEND_UPSTREAM="$upstream"

# Use the resolvers this container was given, not a hardcoded Docker one: the
# host may put its parts on a different network. A variable proxy_pass needs
# one, since nginx would otherwise resolve the API name once at startup and
# refuse to start if the API part is still booting.
resolvers=$(awk '/^nameserver/ { printf "%s ", $2 }' /etc/resolv.conf 2>/dev/null || true)
[ -n "$resolvers" ] || resolvers="127.0.0.11 "
export NGINX_RESOLVERS="$resolvers"

log "proxying /api to $upstream (resolvers: $resolvers)"

mkdir -p /tmp/nginx/conf \
    /tmp/client_temp /tmp/proxy_temp /tmp/fastcgi_temp \
    /tmp/uwsgi_temp /tmp/scgi_temp

envsubst '${BACKEND_UPSTREAM} ${NGINX_RESOLVERS}' \
    < /etc/nginx/templates/default.conf.template \
    > /tmp/nginx/conf/default.conf

exec nginx -g 'daemon off;'
