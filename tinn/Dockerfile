# Adattatore Tinn (import contabilità, fase 4): scarica il backup della
# contabilità via SFTP, lo ripristina con il Firebird di questa immagine ed
# estrae i CSV del formato neutro per UtenzePA. Nessun server Firebird in
# ascolto: gbak e isql lavorano in embedded sul file locale.
FROM firebirdsql/firebird:5.0.3 AS production

# upgrade: l'immagine base esce di rado, le correzioni di sicurezza Debian
# arrivano prima (Trivy bloccante in CI).
RUN apt-get update \
 && apt-get upgrade -y \
 && apt-get install -y --no-install-recommends python3 python3-paramiko python3-croniter unzip tzdata \
 && rm -rf /var/lib/apt/lists/* \
 && (getent passwd 1000 >/dev/null || useradd --uid 1000 --create-home --shell /usr/sbin/nologin tinn) \
 && mkdir -p /inbox /work \
 && chown 1000:1000 /inbox /work

# Lock di Firebird in una cartella dell'utente 1000: /tmp/firebird è del
# server e non è scrivibile in embedded da un altro utente.
ENV FB_BIN=/opt/firebird/bin \
    FIREBIRD_LOCK=/tmp/tinn-lock \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=Europe/Rome

WORKDIR /app
COPY app ./app

USER 1000
VOLUME ["/inbox", "/work"]
ENTRYPOINT ["python3", "-m", "app.main"]

FROM production AS test
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3-pytest \
 && rm -rf /var/lib/apt/lists/*
COPY tests ./tests
COPY testdata ./testdata
USER 1000
ENTRYPOINT []
CMD ["python3", "-m", "pytest", "-q"]
