# Development and release workflow

Use a laptop as the development environment and keep the VM as production. Do
not develop directly in `/opt/gokite` or use the public site for testing.

## Run locally

Clone the repository on the laptop and work on a feature branch:

```bash
git clone git@github.com:bulat-andrey/ifs-15d-forecasting.git
cd ifs-15d-forecasting
git checkout -b fix/short-description
```

Run the server on a development port. Binding to `0.0.0.0` makes it reachable
from a phone on the same private Wi-Fi network:

```bash
HOST=0.0.0.0 PORT=8877 NODE_ENV=development node src/server.js
```

Open `http://127.0.0.1:8877` on the laptop. Find the laptop's private address
with `hostname -I`, then open `http://LAPTOP_IP:8877` on the phone. The laptop
and phone must be on the same Wi-Fi network. Allow port `8877` only on the
private network if the laptop firewall asks.

Check both desktop and the real phone, including the spot table, graph, map,
rotation, fullscreen, timeline, and external links. Browser device emulation
is useful for quick layout checks, but does not replace a real-phone check.

The local server fetches forecast data from Open-Meteo, so its first health
response may be `503` while the forecast cache is loading. Wait until this
returns `ok: true`:

```bash
curl -fsS http://127.0.0.1:8877/api/health
```

Before committing:

```bash
git diff --check
node --check src/server.js
```

## Review and merge

Commit with a Conventional Commit message and push the feature branch:

```bash
git add <changed-files>
git commit -m "fix: short description"
git push -u origin fix/short-description
```

Open a pull request with a Conventional Commit title. Use **Squash and merge**
so one feature produces one commit on `master`.

## Deploy to production

After the pull request is merged, update the VM and run the deployment script
from the repository checkout:

```bash
git checkout master
git pull --ff-only origin master
./deploy/deploy.sh
curl -fsS https://gokite.pomorskie.pl/api/health
```

The script requires a clean working tree, preserves `.env*` files, installs the
systemd unit, restarts GoKite, and waits for the local forecast health check.
The first connection refusal during restart is normal; the script keeps
retrying until the forecast cache is ready or the timeout is reached.

Never expose the laptop development port publicly, commit secrets, or run
`git pull` on a dirty production checkout. Caddy does not need to reload for
normal application or frontend changes.
