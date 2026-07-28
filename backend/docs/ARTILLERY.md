# Artillery - Load Testing

## Cos'è Artillery?

Artillery è uno strumento di load testing moderno e potente che permette di simulare carico reale sulle API dell'applicazione. Viene utilizzato per testare le performance, la stabilità e l'affidabilità del sistema sotto stress.

## Quando utilizzare Artillery?

- **Prima del rilascio in produzione**: Per verificare che l'applicazione possa gestire il carico previsto
- **Dopo modifiche significative**: Per assicurarsi che le performance non siano degradate
- **Per test di capacità**: Per determinare i limiti del sistema e identificare colli di bottiglia
- **Integrazione con Sentry**: Per verificare il corretto tracciamento delle metriche di performance e degli errori

## Configurazioni disponibili

Il progetto include 4 configurazioni di test con livelli di carico crescenti:

### 1. Low Load Test
- **Durata**: 1 minuto
- **Carico**: 5 richieste/secondo
- **Quando usarlo**: Test rapidi durante lo sviluppo, verifica funzionalità base

### 2. Medium Load Test
- **Durata**: 2 minuti
- **Carico**: 25 richieste/secondo
- **Quando usarlo**: Test di integrazione, verifica stabilità con carico moderato

### 3. High Load Test
- **Durata**: 10 minuti
- **Carico**: 50-1000 richieste/secondo (con picchi)
- **Fasi**:
  - 50 req/s per 3 minuti
  - 100 req/s per 1 minuto (picco)
  - 50 req/s per 3 minuti
  - 1000 req/s per 1 minuto (picco estremo)
  - 500 req/s per 2 minuti
- **Quando usarlo**: Test pre-produzione, stress test completo

### 4. Massive Load Test
- **Durata**: 95 minuti
- **Carico**: 1-1.000.000 richieste/secondo
- **Caratteristiche speciali**:
  - 20 fasi progressive
  - Include test di query lente (30% delle richieste con delay di 3 secondi)
  - Picchi estremi fino a 1M richieste/secondo
- **Quando usarlo**: Test di carico estremo, verifica limiti del sistema, stress test completo per produzione ad alto traffico

## Come utilizzare Artillery

### Metodo 1: Script interattivo (Consigliato)

```bash
npm run artillery:run
```

Lo script:
1. Avvia automaticamente Docker Compose se non è in esecuzione
2. Attende che l'applicazione sia pronta (health check)
3. Presenta un menu interattivo per scegliere il test:
   - 1) Low - 1 minuto
   - 2) Medium - 2 minuti
   - 3) High - 10 minuti
   - 4) Massive - 95 minuti
   - 5) All - 108 minuti (esegue tutti i test in sequenza)

### Metodo 2: Comandi diretti

```bash
# Singoli test
npm run artillery:low
npm run artillery:medium
npm run artillery:high
npm run artillery:massive

# Tutti i test in sequenza
npm run artillery:all
```

### Metodo 3: Comando artillery diretto

```bash
# Permette personalizzazioni avanzate
artillery run artillery/load-test-low.yml
artillery run artillery/load-test-medium.yml --output report.json
```

## Cosa testa Artillery

Ogni test esegue operazioni CRUD complete sull'entità di test:

1. **Health check**: Verifica che l'applicazione sia attiva
2. **Create (POST)**: Crea una nuova entità
3. **Read All (GET)**: Recupera tutte le entità
4. **Slow Query (GET)**: Simula una query lenta al database (solo in massive, 30% delle richieste)
5. **Read One (GET)**: Recupera l'entità creata per ID
6. **Update (PUT)**: Aggiorna l'entità
7. **Delete (DELETE)**: Elimina l'entità

Il test "Massive" include anche uno scenario dedicato per testare le performance con query lente (3 secondi di delay).

## Analisi dei risultati

Dopo ogni test, Artillery mostra metriche dettagliate:

### Metriche chiave da monitorare:

- **http.response_time**: Tempo di risposta delle API
  - `min`: Tempo minimo
  - `max`: Tempo massimo
  - `median`: Tempo mediano (50° percentile)
  - `p95`: 95° percentile (95% delle richieste sono più veloci di questo valore)
  - `p99`: 99° percentile

- **http.request_rate**: Numero di richieste al secondo
- **http.responses**: Status code delle risposte (200, 201, 404, 500, etc.)
- **http.codes.2xx`: Richieste completate con successo
- **http.codes.4xx**: Errori client
- **http.codes.5xx**: Errori server (da investigare!)

### Valori target raccomandati:

- **p95 < 500ms**: Buone performance
- **p99 < 1000ms**: Performance accettabili
- **Error rate < 0.1%**: Sistema stabile
- **http.codes.5xx = 0**: Nessun errore server (ideale)

## Integrazione con Sentry

Se abilitato, durante i test, Sentry traccia automaticamente:

- **Performance delle API**: Tempi di risposta, slow queries
- **Errori e exception**: Stack trace completi
- **Database queries**: Performance delle query MongoDB
- **Custom logs**: Eventi personalizzati (es. creazione entità)

**Attenzione! Ricordarsi di impostare test come environment**

### Visualizzare i dati in Sentry:

1. Accedi alla dashboard Sentry
2. Sezione **Performance**: Visualizza i tempi di risposta e le transazioni
3. Sezione **Issues**: Controlla eventuali errori generati durante il test
4. Filtra per timestamp del test per isolare i dati

## Best Practices

### Durante lo sviluppo:
- Usa **Low** per test rapidi delle funzionalità
- Esegui **Medium** prima di ogni commit importante
- Verifica sempre che non ci siano errori 5xx

### Prima del merge/release:
- Esegui **High** per verificare stabilità sotto carico
- Controlla i log di Sentry per individuare problemi di performance
- Verifica che p95 e p99 siano nei limiti accettabili

### Test di produzione:
- Esegui **Massive** in ambiente di staging prima del deploy
- Monitora l'uso di risorse (CPU, RAM, DB connections)
- Identifica i limiti del sistema e pianifica lo scaling

### Troubleshooting:
- Se vedi errori 5xx: controlla i log dell'applicazione e Sentry
- Se i tempi di risposta sono alti: identifica le query lente nel database
- Se il test fallisce all'avvio: verifica che Docker sia in esecuzione

## File di configurazione

I file di configurazione si trovano in `artillery/`:

- `load-test-low.yml`: Configurazione test leggero
- `load-test-medium.yml`: Configurazione test medio
- `load-test-high.yml`: Configurazione test pesante
- `load-test-massive.yml`: Configurazione test estremo

### Struttura file di configurazione:

```yaml
config:
  target: 'http://localhost:3000'  # URL base dell'applicazione
  phases:                          # Fasi del test
    - duration: 60                 # Durata in secondi
      arrivalRate: 5              # Richieste al secondo
      name: 'Description'         # Descrizione fase
  defaults:
    headers:
      Content-Type: 'application/json'

scenarios:                        # Scenari da eseguire
  - name: 'Scenario name'
    weight: 7                     # Peso relativo (70% in questo caso)
    flow:                         # Sequenza di richieste
      - get:
          url: '/api/v1/endpoint'
```

## Personalizzazione

### Modificare il carico:

1. Apri il file YAML desiderato in `artillery/`
2. Modifica i parametri `duration` e `arrivalRate` nelle fasi
3. Salva e riesegui il test

### Aggiungere nuovi endpoint:

1. Aggiungi nuove richieste nel `flow` dello scenario
2. Usa variabili per dati dinamici: `{{ $randomString() }}`
3. Cattura risposte per usarle in richieste successive:
   ```yaml
   capture:
     - json: '$._id'
       as: 'myId'
   ```

### Creare un nuovo scenario:

```yaml
scenarios:
  - name: 'My custom scenario'
    weight: 5
    flow:
      - get:
          url: '/my-endpoint'
      - post:
          url: '/my-endpoint'
          json:
            field: 'value'
```

## Risorse utili

- [Documentazione ufficiale Artillery](https://www.artillery.io/docs)
- [Guida agli scenari](https://www.artillery.io/docs/guides/guides/test-script-reference)
- [Dashboard Sentry Performance](https://docs.sentry.io/product/performance/)

## Supporto

Per problemi o domande:
1. Verifica la sezione Troubleshooting in questo documento
2. Controlla i log di Docker Compose: `docker compose logs -f`
3. Verifica la dashboard Sentry per errori dettagliati
4. Contatta il team DevOps per supporto avanzato
