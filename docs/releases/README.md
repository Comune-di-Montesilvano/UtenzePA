# Note di rilascio

Un file per versione, `vX.Y.Z.md`, scritto nella PR che alza `softwareVersion` in `publiccode.yml`.
Il job `security-scripts` di `tests.yml` controlla che esista il file della versione di `publiccode.yml`;
`release.yml` lo ricontrolla prima di buildare il tag e alla fine lo pubblica come release GitHub,
con in coda digest e comando di verifica delle immagini (`scripts/release-notes.sh`).

Per chi aggiorna un'installazione, non un elenco di commit: cosa cambia per gli utenti, impatto di
sicurezza, passi da fare. Titoli obbligatori `## Changelog` e `### Sicurezza` (mai vuota: se non ci
sono modifiche, «Nessuna modifica di sicurezza.»); le altre sezioni solo se servono.

```markdown
## Changelog

### Novità
- Cosa possono fare ora gli utenti (#PR).

### Correzioni
- Cosa non funzionava e in quali casi (#PR).

### Sicurezza
- Problema, chi poteva sfruttarlo e con quale effetto, cosa cambia (#PR).

### Aggiornamento
- Migration, variabili nuove o cambiate, passi manuali; altrimenti «Nessuna azione oltre a pull e up».
```
