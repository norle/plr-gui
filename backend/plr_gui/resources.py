from __future__ import annotations

import inspect
from typing import Any

from plr_gui.models import CustomResourceRequest, CustomResourceResponse, ResourceFactory


def list_resource_factories(limit: int = 300) -> list[ResourceFactory]:
  import pylabrobot.resources as resources

  factories: list[ResourceFactory] = []
  for name in sorted(dir(resources)):
    if name.startswith("_"):
      continue
    value = getattr(resources, name)
    if not callable(value):
      continue
    module = getattr(value, "__module__", "")
    if not module.startswith("pylabrobot.resources"):
      continue
    try:
      signature = str(inspect.signature(value))
    except (TypeError, ValueError):
      signature = "()"
    doc = inspect.getdoc(value)
    factories.append(
      ResourceFactory(
        name=name,
        module=module,
        signature=signature,
        doc=doc.splitlines()[0] if doc else None,
      )
    )
    if len(factories) >= limit:
      break
  return factories


def create_custom_resource(request: CustomResourceRequest) -> CustomResourceResponse:
  data: dict[str, Any] = {
    "kind": request.kind,
    "name": request.name,
    "size": [request.size_x, request.size_y, request.size_z],
  }
  if request.kind == "box":
    python = (
      "from pylabrobot.resources import Resource\n\n"
      f"resource = Resource({request.name!r}, size_x={request.size_x}, "
      f"size_y={request.size_y}, size_z={request.size_z}, category='custom')\n"
    )
  elif request.kind == "container":
    python = (
      "from pylabrobot.resources import Container\n\n"
      f"resource = Container({request.name!r}, size_x={request.size_x}, "
      f"size_y={request.size_y}, size_z={request.size_z}, category='custom_container')\n"
    )
  else:
    rows = request.rows or 8
    columns = request.columns or 12
    well_volume = request.well_volume or 200
    data.update({"rows": rows, "columns": columns, "well_volume": well_volume})
    python = (
      "from pylabrobot.resources import Plate, Well, create_ordered_items_2d\n"
      "from pylabrobot.resources.well import CrossSectionType, WellBottomType\n\n"
      f"items = create_ordered_items_2d(Well, num_items_x={columns}, num_items_y={rows}, "
      "dx=9, dy=9, dz=1, item_dx=6.8, item_dy=6.8, size_x=6.8, size_y=6.8, "
      f"size_z={request.size_z - 1}, max_volume={well_volume}, "
      "cross_section_type=CrossSectionType.CIRCLE, bottom_type=WellBottomType.FLAT)\n"
      f"resource = Plate({request.name!r}, size_x={request.size_x}, "
      f"size_y={request.size_y}, size_z={request.size_z}, items=items)\n"
    )
  return CustomResourceResponse(python=python, json_definition=data)

