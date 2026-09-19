# 28teh sandbox image – one container per browser session, attached as an interactive shell.
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 LC_ALL=C.UTF-8
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git python3 nodejs npm openjdk-21-jdk-headless gcc g++ libc6-dev nano less procps \
 && rm -rf /var/lib/apt/lists/*

# ubuntu:24.04 ships a default "ubuntu" user on uid 1000; replace it so the sandbox user owns that uid.
RUN userdel -r ubuntu 2>/dev/null || true \
 && useradd --create-home --uid 1000 --shell /bin/bash developer

# Prints the marker line the server intercepts; the URL is only opened if it exactly matches the server allowlist.
RUN printf '#!/bin/sh\nprintf "::TRIGGER_OPEN_URL::https://my-editor-website.com\\n"\n' > /usr/local/bin/visit-site \
 && chmod 755 /usr/local/bin/visit-site

ENV HOME=/home/developer USER=developer TERM=xterm-256color PYTHONUNBUFFERED=1
USER developer
WORKDIR /home/developer
ENTRYPOINT ["/bin/bash", "-l"]
