"""Configurazione dalle variabili d'ambiente (solo da lì: mai file né argomenti)."""
from dataclasses import dataclass


class ConfigError(Exception):
    pass


@dataclass
class Config:
    inbox: str
    work: str
    host: str | None
    port: int
    user: str | None
    password: str | None
    path: str | None
    db_file: str
    host_key: str | None
    cron: str
    local_zip: str | None

    @classmethod
    def from_env(cls, env):
        def get(name, default=None):
            value = (env.get(name) or '').strip()
            return value or default

        local_zip = get('TINN_LOCAL_ZIP')
        required = ['TINN_DB_FILE'] + ([] if local_zip else
                                       ['TINN_SFTP_HOST', 'TINN_SFTP_USER', 'TINN_SFTP_PASSWORD', 'TINN_SFTP_PATH'])
        missing = [name for name in required if not get(name)]
        if missing:
            raise ConfigError('Variabili mancanti: ' + ', '.join(missing))
        return cls(
            inbox=get('TINN_INBOX', '/inbox'),
            work=get('TINN_WORK', '/work'),
            host=get('TINN_SFTP_HOST'),
            port=int(get('TINN_SFTP_PORT', '22')),
            user=get('TINN_SFTP_USER'),
            # La password non si tocca (spazi compresi): è come l'ha scritta chi installa.
            password=env.get('TINN_SFTP_PASSWORD') or None,
            path=get('TINN_SFTP_PATH'),
            db_file=get('TINN_DB_FILE'),
            host_key=get('TINN_SFTP_HOST_KEY'),
            cron=get('TINN_CRON', '0 4 * * *'),
            local_zip=local_zip,
        )

    def secrets(self):
        return [s for s in (self.password, self.user) if s]
