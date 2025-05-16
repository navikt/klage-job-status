# Klage Job Status
Applikasjon som tilbyr rapportering og henting av status for jobber.

## Domene
https://klage-job-status.ekstern.dev.nav.no

## Bruk
Jobber kan kalle denne applikasjonen for å sette statusen sin.
Statusen kan så hentes av GitHub Actions eller andre applikasjoner/jobber.

### API Key
For å bruke API-et må du ha en API-nøkkel.
Du kan hente API-nøkler med endepunktet [`/api-keys/<namespace>`](https://klage-job-status.ekstern.dev.nav.no/api-keys/example-namespace).
> Bytt ut `example-namespace` med ditt eget team eller namespace. Lowercase bokstaver, understrek og bindestrek er tillatt.

Alle endepunkter krever en API-nøkkel i headeren `API_KEY`.

#### Eksempler
- `API_KEY: klage:read.MU71PJn99JCV2a2py6uQw3_aL7I6YSH_Dd3HLAhr5WM`
- `API_KEY: klage:write.LUnvtF_j11pgeJAIRm-NdcdaJ5Fbq74nydx3F7TAVTo`

Bruk `read`-nøkkelen for å hente status (f.eks. fra GitHub Action) og `write`-nøkkelen for å oppdatere status (f.eks. fra `Naisjob`).

> Nøklene kan kun hente og oppdatere status for jobber i namespacet de ble opprettet for.

### Hvordan bruke i dine egne GitHub Actions
For å ta i bruk denne tjenesten i dine GitHub Actions, trenger du tre ting:
1. En ID for jobben din. Denne kan være dynamisk, f.eks. en UUID, eller en statisk ID om du vil gjenbruke ID-en.
    - Ved bruk av statiske ID-er må selv passe på å slette jobben før neste kjøring.
2. En jobb som rapporterer statusen sin til `klage-job-status` med sin egen ID.
    - Et Nais-manifest for jobben som videreformidler ID-en til jobben er nødvendig for dynamiske ID-er.
3. Inkludere `navikt/klage-job-status/action@main` actionen i din workflow.

```yaml
- name: Generate UUID
  id: uuid
  shell: bash
  run: echo "uuid=$(uuidgen)" >> $GITHUB_OUTPUT

- name: Run E2E tests
  uses: nais/deploy/actions/deploy@v2
  env:
    CLUSTER: dev-gcp
    VAR: jobid=${{ steps.uuid.outputs.uuid }},image=${{ needs.build.outputs.image }} # Ditt image og jobb-ID.
    TEAM: klage
    RESOURCE: nais/e2e-job.yaml # Din jobb.
    IMAGE: ${{ needs.build.outputs.image }}

- name: Check E2E job status
  uses: navikt/klage-job-status/action@main
  with:
    api_key: ${{ secrets.STATUS_API_KEY }} # API-nøkkelen din.
    job_id: ${{ steps.uuid.outputs.uuid }} # ID-en til jobben din.
    fail: true # Hvis jobben feiler, vil denne sørge for hele workflowen feiler.
    fail_on_unknown: true # Hvis jobben ikke finnes, vil denne sørge for hele workflowen feiler.
```

#### Eksempel på Nais-jobb
Merk at environment-variabelen `JOB_ID` blir satt til jobben sin ID fra `VAR` i `nais/deploy/actions/deploy@v2` over.
Denne jobben vil selv oppdatere statusen sin mot [klage-job-status](https://klage-job-status.ekstern.dev.nav.no) med denne ID-en.

`nais/e2e-job.yaml`
```yaml
apiVersion: nais.io/v1
kind: Naisjob
metadata:
  labels:
    team: klage
    e2e: kabal
  name: kabal-e2e-tests-{{jobid}}
  namespace: klage
spec:
  backoffLimit: 0
  concurrencyPolicy: Forbid
  resources:
    requests:
      cpu: 500m
      memory: 512Mi
    limits:
      cpu: 8000m
      memory: 8Gi
  image: {{image}}
  env:
    - name: JOB_ID
      value: {{jobid}} # Sørger for at jobben vet om sin egen ID.
  envFrom:
    - secret: klage-job-status-write-api-key # Sørger for at jobben har riktig API-nøkkel for å oppdatere status.
  accessPolicy:
    outbound:
      external:
        - host: kabal.intern.dev.nav.no
```

## Endepunkter
Alle endepunkter starter med `/jobs/<jobId>`.
- `jobId` identifiserer den spesifikke jobben, f.eks. en UUID.

Alle endepunkter svare med en 404-feilmelding hvis jobben ikke finnes.

### `POST /jobs/<jobId>` - `text/plain`
Oppretter en ny jobb med `status` `RUNNING`.

Dette endepunktet kan ta imot en JSON payload med følgende felter:
- `timeout` - (valgfri) hvor lenge jobben kan eksistere før den blir slettet. Standard er 10 minutter.
- `name` - (valgfri) navnet på jobben i loggene. Standard er `jobId`.
```json
{
  "timeout": 600,
  "name": "Min jobb"
}
```

### `GET /jobs/<jobId>` - `application/json`
Returnerer hele jobben.
Dette endepunktet støtter også SSE (Server-Sent Events) ved å legge til `Accept: text/event-stream` i headeren.
Lytt på `job`-eventer og parse `data`-feltet som JSON.

#### Running
```json
{
  "status": "RUNNING",
  "created": 1747221619071,
  "modified": 1747221619071,
  "ended": null,
  "name": "Min jobb"
}
```

#### Success
```json
{
  "status": "SUCCESS",
  "created": 1747221619071,
  "modified": 1747221619071,
  "ended": 1747221619071,
  "name": "Min jobb"
}
```

#### Failed
```json
{
  "status": "FAILED",
  "created": 1747221619071,
  "modified": 1747221619071,
  "ended": 1747221619071,
  "name": "Min jobb"
}
```

### `GET /jobs/<jobId>/status` - `text/plain`
Returnerer `status` for jobben: `RUNNING`, `SUCCESS` eller `FAILED`

### `GET /jobs/<jobId>/success` - `text/plain`
Returnerer `true` hvis jobben har `status` `SUCCESS`, ellers `false`.

### `GET /jobs/<jobId>/failed` - `text/plain`
Returnerer `true` hvis jobben har `status` `FAILED`, ellers `false`.

### `GET /jobs/<jobId>/running` - `text/plain`
Returnerer `true` hvis jobben har `status` `RUNNING`, ellers `false`.

### `DELETE /jobs/<jobId>` - `text/plain`
Sletter jobben.

Returnerer `Deleted job <jobId>`.
