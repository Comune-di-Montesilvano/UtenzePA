# CORS, pulizia mailer morto, wizard bootstrap primo Admin — design

Data: 2026-08-03
Segue: `2026-08-03-allineamento-standard-interni-design.md`, sezione "Fuori scope"

## Contesto

Tre punti lasciati aperti dallo spec di allineamento agli standard interni:

1. CORS aperto a qualsiasi origine (`cors: true` hardcoded in `main.ts`), variabile `CORS_ORIGIN` presente in `backend/.env.example` ma mai letta da nessun modulo.
2. Doppio sistema email: `core/email/email.service.ts` (usato realmente da `AuthMysqlModule`) e `common/mailer/mailer.service.ts` (generico) — verificato: **`MailerModule`/`MailerService` non sono importati in nessun punto di `app.module.ts`**, morto al 100%, non da "unificare" ma da rimuovere.
3. Nessun meccanismo per creare il primo utente Admin: `POST /system-users` richiede già un Admin (`@Roles('Admin')`), nessuno script di seed. A differenza di comunicaPA (auth operatori delegata a LDAP/AD, il problema non esiste), qui gli account sono locali (bcrypt+JWT).

I primi due sono fix diretti (poche righe/rimozione file). Il terzo è design vero: un mini-wizard di bootstrap, con verifica email via OTP prima di creare l'account (stesso meccanismo già usato dal reset password), per non permettere di bootstrappare un admin su una email che non si controlla davvero.

## 1. CORS — ristretto all'origine reale

`main.ts` passa `cors: { origin: corsOrigins }` invece di `cors: true`, dove `corsOrigins` è la lista (split su virgola) di `process.env.CORS_ORIGIN`, con fallback `['http://localhost:4300']` per compatibilità con `ng serve` in sviluppo locale.

`CORS_ORIGIN` va aggiunta a `docker-compose.yml` (root, servizio `api`) e a `.env.example` (root) — valore reale in produzione: l'origine pubblica del frontend (es. `https://utenze.comune.montesilvano.pe.it`). La variabile omonima già presente in `backend/.env.example` (mai letta) diventa quella effettiva.

## 2. Rimozione mailer morto

Cancellare:
- `backend/src/common/mailer/mailer.service.ts`
- `backend/src/common/mailer/mailer.interface.ts`
- `backend/src/common/mailer/mailer.service.spec.ts`

Da `backend/.env.example`, rimuovere le variabili mai lette da nessun modulo reale: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`. Restano solo quelle usate davvero da `core/email/email.service.ts`: `HOST_EMAIL`, `PORT_EMAIL`, `USERNAME_EMAIL`, `PASSWORD_EMAIL`, `SMTP_SECURE_PROTOCOL`.

## 3. Wizard bootstrap primo Admin

### Attivazione

Un `SetupGuard` (NestJS `CanActivate`) protegge sia gli endpoint di setup sia — lato frontend — l'accesso alla pagina: controlla `count(SystemUser) === 0` a ogni richiesta (query leggera, nessuna cache: deve riflettere lo stato reale). Se il conteggio non è zero, l'endpoint risponde 404 (non 403: non deve rivelare che è "esistito"). Dopo la creazione del primo admin, il wizard si disattiva per sempre senza bisogno di flag manuali.

### Flusso (stesso pattern OTP del reset password esistente)

**Step 1 — dati e richiesta OTP**
`POST /api/v1/setup/request-otp` — body: `email`, `firstName`, `lastName`, `password`.
- Guard verifica `count === 0`.
- Genera OTP a 6 cifre, scadenza 60 minuti (stessa logica di `AuthService.generateOtp`, non duplicata: estratta in un helper condiviso se conviene in fase di plan).
- **Hasha subito la password** con bcrypt (mai tenuta in chiaro, nemmeno in memoria oltre il tempo di request).
- Salva lo stato pendente **in memoria di processo** (una singola variabile/mappa, non su DB: non esiste ancora nessun utente su cui scrivere, e il flusso è a singolo utilizzo).
- Invia l'OTP via `EMailerService` (quello reale).
- Risponde 200 senza dettagli sensibili.

**Step 2 — verifica OTP e creazione**
`POST /api/v1/setup/verify` — body: `email`, `otp`.
- Guard riverifica `count === 0` (anti-race: due persone che bootstrappano in parallelo).
- Verifica OTP e scadenza contro lo stato pendente.
- Crea il `SystemUser` con `role: Admin` usando l'hash già calcolato allo step 1 (non ri-hashare).
- Pulisce lo stato pendente.
- Risponde 200; il frontend reindirizza a `/login`.

**GET /api/v1/setup/status** — `{ available: boolean }`, usata dal guard di routing frontend per decidere se mostrare la pagina o reindirizzare a `/login`.

### Limiti noti (accettati, non da risolvere ora)

- Lo stato pendente in memoria non sopravvive a un restart del backend a metà flusso: l'utente rifà il form da capo, nessun dato persistito viene perso (non c'era nulla su disco).
- Non funziona se il backend gira su più repliche dietro un load balancer (stato in memoria non condiviso). Non è il caso di questo deployment (singolo container `api`, vedi `docker-compose.yml`).

### Frontend

Nuova pagina `frontend/src/app/pages/setup/` con i due step (dati → OTP), un guard di routing (`setup.guard.ts`) che chiama `GET /api/v1/setup/status` e reindirizza a `/login` se `available: false`.

## Verifica end-to-end

1. DB pulito (zero `system_users`): `GET /api/v1/setup/status` → `available: true`.
2. `POST /api/v1/setup/request-otp` con dati validi → email ricevuta su mailpit (dev) con OTP a 6 cifre.
3. `POST /api/v1/setup/verify` con OTP corretto → utente creato con `role: Admin`, login funzionante con la password inserita.
4. Richiamare di nuovo `GET /api/v1/setup/status` → `available: false`; `POST /api/v1/setup/request-otp` → 404.
5. Due richieste concorrenti di `verify` con OTP validi (stesso o due bootstrap paralleli): solo una deve creare l'admin, la seconda deve fallire per anti-race.
