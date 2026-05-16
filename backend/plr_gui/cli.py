from __future__ import annotations

import argparse

import uvicorn


def main() -> None:
  parser = argparse.ArgumentParser(description="Run the PLR GUI local backend.")
  subparsers = parser.add_subparsers(dest="command")

  serve = subparsers.add_parser("serve", help="Start the local web backend.")
  serve.add_argument("--host", default="127.0.0.1")
  serve.add_argument("--port", type=int, default=8765)
  serve.add_argument("--reload", action="store_true")

  args = parser.parse_args()
  if args.command in {None, "serve"}:
    uvicorn.run(
      "plr_gui.main:app",
      host=args.host,
      port=args.port,
      reload=args.reload,
    )


if __name__ == "__main__":
  main()

