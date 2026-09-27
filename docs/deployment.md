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
Internet -> Caddy container (TLS) -> host:8787 -> gokite.service
```

Caddy stays running during an application update. The current single-process
setup has a short possible gap while Node is replaced; it is not zero-downtime.

## Security baseline

- Caddy terminates HTTPS and adds HSTS, anti-sniffing, clickjacking, referrer,
  and permissions-policy headers.
- Node accepts only `GET` and `HEAD` requests; it has no write endpoints.
- The systemd unit runs as the unprivileged `gokite` user with filesystem,
  kernel, namespace, device, and privilege restrictions.
- Keep port `8787` blocked in the host firewall. It must be reachable by the
  Caddy container, but not directly from the internet.
- Never commit `.env` files, tokens, private keys, database files, or logs.
  The repository `.gitignore` protects these local artifacts; `.env.example`
  is the only environment file intended for Git.

After changing the Caddy configuration, validate it before reloading:

```bash
docker exec krotkahomeops-caddy-1 caddy validate --config /etc/caddy/Caddyfile
docker exec krotkahomeops-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

## Install the GoKite systemd service

For a persistent production installation, copy the repository to `/opt/gokite`
and run the service as the dedicated `gokite` user. The unit uses a system-wide
Node 18+ binary at `/usr/local/bin/node-gokite` and binds to port `8787` for the
Docker-based Caddy reverse proxy; Caddy remains the public HTTPS entry point.

```bash
sudo useradd --system --home /opt/gokite --shell /usr/sbin/nologin gokite || true
sudo chown -R gokite:gokite /opt/gokite
sudo cp deploy/gokite.service /etc/systemd/system/gokite.service
sudo systemctl daemon-reload
sudo systemctl enable gokite
```

During the one-time handoff, stop the manually detached Node process first,
then start systemd and verify it before testing the public URL:

```bash
sudo pkill -f '/opt/gokite/src/server.js' || true
sudo systemctl start gokite
sudo systemctl status gokite --no-pager
curl -fsS http://127.0.0.1:8787/api/health
sudo journalctl -u gokite -n 50 --no-pager
```

After this handoff, deploys use `sudo systemctl restart gokite` and logs are
available with `sudo journalctl -u gokite -f`. Caddy does not need to reload for
normal application or forecast-code changes.

## Deploy an update

Pull and validate the revision in the working copy, then run the deployment
script. The script refuses to deploy a dirty working tree, preserves `.env*`
files in `/opt/gokite`, installs the systemd unit, restarts the service, and
waits for a healthy forecast response:

```bash
cd /home/bulat/workplace/sultansradar
git pull --ff-only origin master
./deploy/deploy.sh
```

The script checks `http://127.0.0.1:8787/api/health` by default. Override the
deployment directory or wait time when needed:

```bash
WAIT_SECONDS=180 ./deploy/deploy.sh
```

A healthy response has HTTP `200` and `ok: true`. During cold start,
`/api/health` intentionally returns `503`; wait rather than restarting in a
loop. Check `sudo journalctl -u gokite -n 50 --no-pager` if it remains unhealthy.

After the local check succeeds, verify the public reverse proxy separately:

```bash
curl -fsS https://gokite.pomorskie.pl/api/health
curl -fsS https://gokite.pomorskie.pl/api/forecast \
  | node -e "let d=''; process.stdin.on('data', x => d += x).on('end', () => { const j=JSON.parse(d); console.log(j.spots.map(s => s.name).join(', ')); })"
```

## Safer future deployment

For no visible interruption, run the new revision on a second port such as
`8788`, run the health and forecast checks there, then change Caddy's upstream
to that port and reload Caddy. Keep the old process on `8787` until the new
process is healthy. This is a blue-green swap and should be the next production
improvement if deployments become frequent.

Do not run two revisions on the same port. Do not reload Caddy when only
`src/` or `public/` changed; Caddy serves the same upstream and does not need a
configuration change.
