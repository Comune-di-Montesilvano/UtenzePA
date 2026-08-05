/**
 * Assertion di sicurezza da eseguire al boot dell'applicazione.
 *
 * `.env.example` fornisce dei placeholder "change-me-in-production..." per i
 * secret che firmano JWT/cookie e per la password MySQL. Se in un deployment
 * non-development uno di questi è ancora il placeholder, l'app parte con
 * credenziali note pubblicamente (sono nel repo): rifiutiamo l'avvio.
 */

const DEFAULT_SECRETS: Record<string, string> = {
  JWT_ACCESS_SECRET: 'change-me-in-production-use-openssl-rand-hex-32',
  COOKIE_SECRET: 'change-me-in-production-use-openssl-rand-hex-32',
  MYSQL_PASSWORD: 'change-me-in-production-openssl-rand-hex-24',
};

export function assertProductionSecrets(nodeEnv: string | undefined): void {
  if (nodeEnv === 'development') {
    return;
  }

  for (const [envVar, defaultValue] of Object.entries(DEFAULT_SECRETS)) {
    if (process.env[envVar] === defaultValue) {
      throw new Error(
        `${envVar} non è impostato (usa ancora il placeholder di ${'.env.example'}). ` +
          `Impostare una variabile d'ambiente ${envVar} robusta e casuale (es. openssl rand -hex 32) ` +
          `prima di avviare in ambiente '${nodeEnv}'.`,
      );
    }
  }
}
