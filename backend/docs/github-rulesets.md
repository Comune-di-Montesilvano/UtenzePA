# GitHub Repository Rulesets

Questa directory contiene le configurazioni dei **Repository Rulesets** per la protezione dei branch.

## 📋 Cosa sono i Rulesets?

I Rulesets sono la nuova generazione di Branch Protection Rules di GitHub, con vantaggi come:

- ✅ **Più flessibili**: possono applicarsi a più branch con pattern
- ✅ **API-first**: facilmente versionabili e applicabili via code
- ✅ **Bypass actors**: controllo granulare su chi può bypassare le regole
- ✅ **Evaluation mode**: possibilità di testare regole senza enforcing

## 📁 File Presenti

### `main-protection.json`
Ruleset per il branch **main** (produzione):

**Regole applicate:**
- ✅ Pull Request required (0 approvals per Dependabot)
- ✅ Status checks required: Quick Checks, Security Check, PR Status Check
- ✅ Strict status checks (branch must be up-to-date)
- ✅ No deletion allowed
- ✅ No force push allowed
- ✅ Linear history required
- ✅ Signed commits required (opzionale)

**Bypass actors:**
- Repository Admins (sempre)

### `develop-staging-protection.json`
Ruleset per i branch **develop** e **staging**:

**Regole applicate:**
- ✅ Pull Request required (0 approvals)
- ✅ Status checks required: Quick Checks, Security Check
- ⚠️ Non-strict status checks (più flessibile)
- ✅ No deletion allowed

**Bypass actors:**
- Repository Admins (sempre)

## 🚀 Applicazione dei Rulesets

### Prerequisiti

1. **GitHub CLI installato e autenticato**
   ```bash
   gh --version
   gh auth status
   ```

2. **Permessi Admin** sul repository
   - I Rulesets richiedono permessi di amministratore

3. **Repository su GitHub**
   - I Rulesets sono una feature GitHub-only

### Metodo 1: Via Script (Raccomandato)

```bash
# Rendi lo script eseguibile
chmod +x .github/rulesets/apply-rulesets.sh

# Esegui lo script (autodetect repository)
.github/rulesets/apply-rulesets.sh

# O specifica un repository
.github/rulesets/apply-rulesets.sh GOINFOTEAM/nestjs-template
```

Lo script:
1. ✅ Verifica permessi
2. ✅ Abilita auto-merge a livello repository
3. ✅ Crea o aggiorna i rulesets
4. ✅ Fornisce link per verificare

### Metodo 2: Via GitHub CLI Manuale

```bash
# Login
gh auth login

# Abilita auto-merge
gh api -X PATCH repos/GOINFOTEAM/nestjs-template \
  -f allow_auto_merge=true \
  -f allow_squash_merge=true \
  -f delete_branch_on_merge=true

# Applica ruleset main
gh api -X POST repos/GOINFOTEAM/nestjs-template/rulesets \
  --input .github/rulesets/main-protection.json

# Applica ruleset develop/staging
gh api -X POST repos/GOINFOTEAM/nestjs-template/rulesets \
  --input .github/rulesets/develop-staging-protection.json
```

### Metodo 3: Via GitHub UI

1. Vai su **Settings → Rules → Rulesets**
2. Click **New ruleset → New branch ruleset**
3. Copia configurazione da JSON file
4. Salva e attiva

## 🔧 Personalizzazione

### Modificare i Branch Protetti

Edita `conditions.ref_name.include` nel file JSON:

```json
{
  "conditions": {
    "ref_name": {
      "include": [
        "refs/heads/main",
        "refs/heads/release/*"  // Aggiungi pattern
      ]
    }
  }
}
```

### Modificare Status Checks Richiesti

Edita `rules[].parameters.required_status_checks`:

```json
{
  "type": "required_status_checks",
  "parameters": {
    "required_status_checks": [
      {
        "context": "Quick Checks",
        "integration_id": null
      },
      {
        "context": "Build",  // Aggiungi nuovo check
        "integration_id": null
      }
    ]
  }
}
```

### Modificare Numero di Approvals

Per richiedere approvazioni (nota: disabilita auto-merge Dependabot):

```json
{
  "type": "pull_request",
  "parameters": {
    "required_approving_review_count": 1  // 0 = nessuna approval
  }
}
```

### Aggiungere Bypass Actors

```json
{
  "bypass_actors": [
    {
      "actor_id": 5,
      "actor_type": "RepositoryRole",  // Admin
      "bypass_mode": "always"
    },
    {
      "actor_id": 1234567,
      "actor_type": "Team",  // Specific team
      "bypass_mode": "pull_request"
    }
  ]
}
```

**Actor Types:**
- `RepositoryRole`: 1 = Maintainer, 2 = Write, 4 = Triage, 5 = Admin
- `Team`: Team ID
- `Integration`: GitHub App installation ID
- `OrganizationAdmin`: Org admins

## 📊 Verifica Configurazione

### Via GitHub UI

```bash
# Apri repository settings
gh repo view GOINFOTEAM/nestjs-template --web

# Naviga a: Settings → Rules → Rulesets
```

### Via GitHub CLI

```bash
# Lista tutti i rulesets
gh api repos/GOINFOTEAM/nestjs-template/rulesets

# Dettagli di un ruleset specifico
gh api repos/GOINFOTEAM/nestjs-template/rulesets/{ruleset_id}

# Formato leggibile
gh api repos/GOINFOTEAM/nestjs-template/rulesets | jq '.[] | {id, name, enforcement, target}'
```

### Via Script di Test

```bash
# Crea file test-rulesets.sh
cat > test-rulesets.sh << 'EOF'
#!/bin/bash
REPO="GOINFOTEAM/nestjs-template"

echo "📋 Repository Rulesets for ${REPO}"
echo ""

gh api "repos/${REPO}/rulesets" | jq -r '.[] | "
Name: \(.name)
ID: \(.id)
Target: \(.target)
Enforcement: \(.enforcement)
Rules: \(.rules | length)
---"'

echo ""
echo "✅ Repository Settings:"
gh api "repos/${REPO}" | jq '{
  allow_auto_merge,
  allow_squash_merge,
  allow_merge_commit,
  allow_rebase_merge,
  delete_branch_on_merge
}'
EOF

chmod +x test-rulesets.sh
./test-rulesets.sh
```

## 🔄 Aggiornamento dei Rulesets

### Update via Script

```bash
# Modifica il file JSON
vim .github/rulesets/main-protection.json

# Ri-applica
.github/rulesets/apply-rulesets.sh
```

Lo script rileva automaticamente se il ruleset esiste e lo aggiorna.

### Update via API

```bash
# Get ruleset ID
RULESET_ID=$(gh api repos/GOINFOTEAM/nestjs-template/rulesets \
  --jq '.[] | select(.name == "Main Branch Protection") | .id')

# Update
gh api -X PUT repos/GOINFOTEAM/nestjs-template/rulesets/${RULESET_ID} \
  --input .github/rulesets/main-protection.json
```

## ❌ Rimozione dei Rulesets

### Via Script

```bash
cat > delete-rulesets.sh << 'EOF'
#!/bin/bash
REPO="GOINFOTEAM/nestjs-template"

# Get all ruleset IDs
gh api "repos/${REPO}/rulesets" --jq '.[].id' | while read id; do
    echo "Deleting ruleset ID: $id"
    gh api -X DELETE "repos/${REPO}/rulesets/${id}"
done

echo "✅ All rulesets deleted"
EOF

chmod +x delete-rulesets.sh
```

### Via API Manuale

```bash
# Delete specific ruleset
gh api -X DELETE repos/GOINFOTEAM/nestjs-template/rulesets/{ruleset_id}
```

## 🆚 Rulesets vs Branch Protection Rules

| Feature | Branch Protection Rules | Repository Rulesets |
|---------|------------------------|---------------------|
| API Support | ✅ | ✅ |
| Multiple branches | ❌ (one rule per branch) | ✅ (pattern matching) |
| Bypass actors | Limited | ✅ Granular |
| Evaluation mode | ❌ | ✅ |
| Status checks | ✅ | ✅ |
| CODEOWNERS | ✅ | ✅ |
| Signed commits | ✅ | ✅ |
| Future-proof | ⚠️ Legacy | ✅ Modern |

**Raccomandazione:** Usa Rulesets per nuovi repository. GitHub sta migrando verso Rulesets come standard.

## 🐛 Troubleshooting

### Error: "Resource not accessible by personal access token"

**Causa:** Token senza permessi sufficienti

**Soluzione:**
```bash
# Re-authenticate con scopes corretti
gh auth login --scopes repo,admin:org,write:repo_hook

# Verifica scopes
gh auth status
```

### Error: "Must have admin rights to Repository"

**Causa:** UtilizerGrant non ha permessi admin

**Soluzione:**
1. Contatta il repository owner
2. O richiedi permessi admin via Settings → Collaborators

### Ruleset Non Applicato

**Verifica:**
```bash
# Check enforcement status
gh api repos/GOINFOTEAM/nestjs-template/rulesets | jq '.[] | {name, enforcement}'
```

**Possibili valori:**
- `active`: Ruleset attivo e enforcing
- `evaluate`: Ruleset in modalità test (non blocca)
- `disabled`: Ruleset disabilitato

### Status Checks Non Riconosciuti

**Causa:** Nome check non corrisponde

**Verifica i nomi esatti:**
```bash
# Check status per una PR specifica
gh pr checks <PR_NUMBER>

# Aggiorna il ruleset con i nomi corretti
```

## 📚 Risorse

- [GitHub Rulesets Documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets)
- [Rulesets API Reference](https://docs.github.com/en/rest/repos/rules)
- [GitHub CLI Documentation](https://cli.github.com/manual/)

## 📝 Note

- ⚠️ I Rulesets richiedono GitHub Team o Enterprise per alcune feature avanzate
- ⚠️ Signed commits richiedono GPG key configurata
- ⚠️ Modifiche ai Rulesets sono logged in Audit Log
- ✅ I Rulesets possono coesistere con Branch Protection Rules (ma può causare conflitti)

---

**Ultimo aggiornamento:** 2025-01-08
