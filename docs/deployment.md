# Deployment

## Local smoke test

Run this from the repository root. The temporary port avoids touching the live
process or the Caddy listener.

```bash
node --check src/server.js
node -e "const spots=require('./src/spots'); console.log(spots.length + ' spots:', spots.map(s => s.name).join(', '))"

HOST=127.0.0.1 PORT=8877 NODE_ENV=production \
  node src/server.js >/tmp/sultansradar-test.log 2>&1 &
TEST_PID=$!
trap 'kill "$TEST_PID" 2>/dev/null || true' EXIT

# The server returns 503 until the first model blend is ready.
until curl -fsS http://127.0.0.1:8877/api/health >/tmp/sultansradar-health.json; do
  sleep 2
done

curl -fsS http://127.0.0.1:8877/api/forecast \
  | node -e "let d=''; process.stdin.on('data', x => d += x).on('end', () => { const j=JSON.parse(d); const s=j.spots.find(x => x.name === 'Kuźnica'); if (!s) process.exit(1); console.log('OK:', j.spots.length, 'spots; Kuźnica present'); })"
```

Stop the test process with `Ctrl-C`, or let the `trap` clean it up when the
shell exits. The test fetches the live forecast models, so it can take a few
seconds and should not be run repeatedly in a tight loop.

## Current server deployment

The production layout is:

```text
Internet -> Caddy container (TLS) -> host:8787 -> src/server.js
```

Caddy stays running during an application update. The current single-process
setup has a short possible gap while Node is replaced; it is not zero-downtime.

1. Pull only the expected branch and inspect the result:

   ```bash
   cd /home/bulat/workplace/sultansradar
   git pull --ff-only origin master
   node --check src/server.js
   git diff HEAD^ -- src/spots.js README.md docs/deployment.md
   ```

2. Stop the old GoKite process, then start the new one detached on the port
   Caddy expects. Do not change the DNS address or Caddy container for an app
   code update:

   ```bash
   pkill -f '/home/bulat/workplace/sultansradar/src/server.js' || true
   setsid env HOST=0.0.0.0 PORT=8787 NODE_ENV=production \
     node /home/bulat/workplace/sultansradar/src/server.js \
     >/tmp/sultansradar-live.log 2>&1 < /dev/null &
   ```

3. Wait for the initial model fetch and verify both local and public health:

   ```bash
   until curl -fsS http://127.0.0.1:8787/api/health; do sleep 2; done
   curl -fsS https://gokite.pomorskie.pl/api/health
   curl -fsS https://gokite.pomorskie.pl/api/forecast \
     | node -e "let d=''; process.stdin.on('data', x => d += x).on('end', () => { const j=JSON.parse(d); console.log(j.spots.map(s => s.name).join(', ')); })"
   ```

   A healthy response has HTTP `200` and `ok: true`. During cold start,
   `/api/health` intentionally returns `503`; wait rather than restarting in a
   loop. Check `/tmp/sultansradar-live.log` if it remains unhealthy.

## Safer future deployment

For no visible interruption, run the new revision on a second port such as
`8788`, run the health and forecast checks there, then change Caddy's upstream
to that port and reload Caddy. Keep the old process on `8787` until the new
process is healthy. This is a blue-green swap and should be the next production
improvement if deployments become frequent.

Do not run two revisions on the same port. Do not reload Caddy when only
`src/` or `public/` changed; Caddy serves the same upstream and does not need a
configuration change.
