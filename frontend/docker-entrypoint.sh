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

# Turn http://name:port into http://<ip>:port when the name resolves.
# nginx's own resolver does not apply the search domains the container was
# given, so a short name can work for one and fail for the other; an address
# has no such trouble.
to_ip() {
    url="$1"
    scheme=${url%%://*}
    rest=${url#*://}
    hostport=${rest%%/*}
    host=${hostport%%:*}
    port=${hostport##*:}
    [ "$port" = "$hostport" ] && port=80
    ip=$(getent hosts "$host" 2>/dev/null | awk '$1 !~ /:/ { print $1; exit }') || true
    if [ -n "${ip:-}" ]; then
        printf '%s://%s:%s' "$scheme" "$ip" "$port"
    else
        printf '%s' "$url"
    fi
}

# Ask the sibling API part first. A host can fill BACKEND_UPSTREAM with the
# app's own public URL, and proxying to that sends /api out to the edge and
# straight back into this container, which the edge answers with 403.
probe=""
for port in 8000 8080; do
    if wget -q -O /dev/null -T 2 "http://backend:$port/api/health" 2>/dev/null; then
        probe=$(to_ip "http://backend:$port")
        break
    fi
done

host_upstream="${BACKEND_UPSTREAM:-}"
upstream="$host_upstream"

# A sibling part is spoken to over plain http inside the app's network; https
# here means the public edge, which would only loop back to this container.
case "$upstream" in
    https://*) upstream="" ;;
esac

# What the probe found beats anything the host set.
if [ -n "$probe" ]; then
    upstream="$probe"
fi

# A trailing slash would double up with the request URI.
upstream=$(printf '%s' "$upstream" | sed 's|/*$||')
upstream="${upstream:-http://backend:8000}"
export BACKEND_UPSTREAM="$upstream"

# Use the resolvers this container was given, not a hardcoded Docker one: the
# host may put its parts on a different network.
resolvers=$(awk '/^nameserver/ { printf "%s ", $2 }' /etc/resolv.conf 2>/dev/null || true)
[ -n "$resolvers" ] || resolvers="127.0.0.11 "
export NGINX_RESOLVERS="$resolvers"

log "proxying /api to $upstream (probe: ${probe:-none}, host set: ${host_upstream:-unset}, resolvers: $resolvers)"
# Names only, so a host that hands out the API address under a variable of its
# own is visible in the log without printing anything secret.
log "address-like settings: $(env | cut -d= -f1 | grep -Ei 'backend|api|host|port|url|service' | sort | tr '\n' ' ')"

mkdir -p /tmp/nginx/conf \
    /tmp/client_temp /tmp/proxy_temp /tmp/fastcgi_temp \
    /tmp/uwsgi_temp /tmp/scgi_temp

envsubst '${BACKEND_UPSTREAM} ${NGINX_RESOLVERS}' \
    < /etc/nginx/templates/default.conf.template \
    > /tmp/nginx/conf/default.conf

exec nginx -g 'daemon off;'
