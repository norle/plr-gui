# PLR GUI

Developer-install local web app for PyLabRobot simulation, run execution, reports, and resource authoring.

## Status

This repo is a V1 scaffold. It is designed to run from source now and be packaged later without changing the app architecture.

## Development

Backend:

```bash
cd /Users/reinis/plr-gui
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
plr-gui serve --reload
```

Frontend:

```bash
cd /Users/reinis/plr-gui/frontend
npm install
npm run dev
```

By default the frontend expects the backend at `http://127.0.0.1:8765`.

## PyLabRobot Dependency

For local development against the integration branch:

```bash
pip install -e /Users/reinis/pylabrobot
```

The backend expects PLR chatterbox GUI exports to use the `export_for_gui()` payload shape when available.
