# PLR GUI

Developer-install local web app for PyLabRobot simulation, run execution, reports, and resource authoring.

## Status

This repo is a V1 scaffold. It is designed to run from source now and be packaged later without changing the app architecture.

## Development

### Conda setup

The local conda environment for this repo is named `plr-gui`.

```bash
conda create -y -n plr-gui python=3.11
conda run -n plr-gui python -m pip install -e /Users/reinis/pylabrobot -e ".[dev]"
```

The PLR checkout at `/Users/reinis/pylabrobot` should be on `plr-gui-v1-integration` so the GUI can use `export_for_gui()`.

Start the GUI:

```bash
./scripts/start_gui.sh
```

Then open:

```text
http://127.0.0.1:8765
```

Use a different port if needed:

```bash
PLR_GUI_PORT=8766 ./scripts/start_gui.sh
```

Verify the env:

```bash
./scripts/check_gui_env.sh
```

### Manual backend setup

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

## Runs Workflow

The Runs page is workspace based. Open a local workspace directory, select or edit Python files
inside that workspace, save launch profiles, and run protocols from the cockpit view. File reads,
writes, and launches are restricted to the selected workspace root.

Each execution creates one run directory in the OS user-data location. New runs write `run.json` as
the canonical manifest while still writing legacy `metadata.json`; logs, trace JSON, report HTML, and
a `source.py` snapshot are stored beside the manifest.

## PyLabRobot Dependency

For local development against the integration branch:

```bash
pip install -e /Users/reinis/pylabrobot
```

The backend expects PLR chatterbox GUI exports to use the `export_for_gui()` payload shape when available.
