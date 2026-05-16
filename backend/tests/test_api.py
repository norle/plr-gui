from __future__ import annotations

from fastapi.testclient import TestClient

from plr_gui.main import app


def test_health() -> None:
  client = TestClient(app)
  response = client.get("/api/health")
  assert response.status_code == 200
  assert response.json()["status"] == "ok"


def test_custom_box_resource() -> None:
  client = TestClient(app)
  response = client.post(
    "/api/resources/custom",
    json={"kind": "box", "name": "deck_insert", "size_x": 10, "size_y": 20, "size_z": 5},
  )
  assert response.status_code == 200
  payload = response.json()
  assert "Resource" in payload["python"]
  assert payload["json_definition"]["name"] == "deck_insert"

