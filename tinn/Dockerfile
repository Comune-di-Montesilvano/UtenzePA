# Adattatore Tinn (import contabilità, fase 4): scarica il backup della
# contabilità via SFTP, lo ripristina con il Firebird di questa immagine ed
# estrae i CSV del formato neutro per UtenzePA. Nessun server Firebird in
# ascolto: gbak e isql lavorano in embedded sul file locale.
FROM firebirdsql/firebird:5.0.3 AS production

# upgrade: l'immagine base esce di rado, le correzioni di sicurezza Debian
# arrivano prima (Trivy bloccante in CI). PKG_REFRESH (data del giorno, da
# release.yml) invalida la cache del layer una volta al giorno, come nel backend.
ARG PKG_REFRESH=none
RUN apt-get update \
 && apt-get upgrade -y \
 && apt-get install -y --no-install-recommends python3 python3-paramiko python3-croniter tzdata \
 && rm -rf /var/lib/apt/lists/* \
 && (getent passwd 1000 >/dev/null || useradd --uid 1000 --create-home --shell /usr/sbin/nologin tinn) \
 && mkdir -p /inbox /work \
 && chown 1000:1001 /inbox /work \
 && chmod 2775 /inbox

# Lock di Firebird in una cartella dell'utente 1000: /tmp/firebird è del
# server e non è scrivibile in embedded da un altro utente.
ENV FB_BIN=/opt/firebird/bin \
    FIREBIRD_LOCK=/tmp/tinn-lock \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=Europe/Rome

WORKDIR /app
COPY app ./app
COPY entrypoint.sh /usr/local/bin/tinn-entrypoint
RUN chmod 0755 /usr/local/bin/tinn-entrypoint

# L'entrypoint parte come root per sistemare i volumi e poi scende a uid 1000.
VOLUME ["/inbox", "/work"]
ENTRYPOINT ["/usr/local/bin/tinn-entrypoint"]

FROM production AS test
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3-pytest \
 && rm -rf /var/lib/apt/lists/*
COPY tests ./tests
COPY testdata ./testdata
USER 1000
ENTRYPOINT []
CMD ["python3", "-m", "pytest", "-q"]
