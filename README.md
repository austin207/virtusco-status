# Forge status

The public status page for Forge: https://austin207.github.io/virtusco-status/

Every 5 minutes a GitHub Action (`.github/workflows/check.yml`) checks the web app, sync and sign-in from outside
Forge's server and records the result on the `data` branch (`status.json`: current state, 90 days per day, incidents).
`index.html` reads it. Nothing private is here: only whether each part answered, and how fast.
