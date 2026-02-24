FROM nginx:alpine

# Remove default config so we use only ours
RUN rm -f /etc/nginx/conf.d/default.conf

# Copy custom configs (template processed at runtime via entrypoint)
COPY nginx.conf /etc/nginx/nginx.conf
COPY options-ssl-nginx.conf /etc/nginx/options-ssl-nginx.conf
COPY conf.d/default.conf.template /etc/nginx/conf.d/default.conf.template
COPY conf.d/default-http-only.conf.template /etc/nginx/conf.d/default-http-only.conf.template
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/entrypoint.sh"]
