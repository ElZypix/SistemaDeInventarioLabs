FROM php:8.3-apache

RUN docker-php-ext-install pdo_mysql \
 && a2enmod rewrite headers \
 && printf '<Directory /var/www/html>\n    AllowOverride All\n    Options -Indexes\n</Directory>\nServerTokens Prod\nServerSignature Off\n' > /etc/apache2/conf-enabled/siglab.conf \
 && { \
      echo 'date.timezone=America/Mexico_City'; \
      echo 'upload_max_filesize=50M'; \
      echo 'post_max_size=55M'; \
      echo 'memory_limit=256M'; \
      echo 'expose_php=Off'; \
      echo 'display_errors=Off'; \
      echo 'log_errors=On'; \
      echo 'session.use_strict_mode=1'; \
      echo 'session.cookie_httponly=1'; \
      echo 'session.cookie_samesite=Lax'; \
    } > /usr/local/etc/php/conf.d/siglab.ini \
 && mkdir -p /var/www/backups && chown www-data:www-data /var/www/backups

WORKDIR /var/www/html
