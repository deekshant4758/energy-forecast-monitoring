FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

# The UI is served by nginx on 8080, which is the port container hosts route
# to. nginx runs as whatever user the host gives it, so all of its writable
# state is kept under /tmp: see nginx.conf and docker-entrypoint.sh. The server
# block is rendered at start so the API address can change without a rebuild.
ENV BACKEND_UPSTREAM=http://backend:8000

COPY nginx.conf /etc/nginx/nginx.conf
COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /usr/local/bin/render-and-start
RUN chmod 0755 /usr/local/bin/render-and-start \
    && sed -i 's/\r$//' /usr/local/bin/render-and-start \
        /etc/nginx/nginx.conf /etc/nginx/templates/default.conf.template \
    && rm -f /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

ENTRYPOINT []
CMD ["/usr/local/bin/render-and-start"]
