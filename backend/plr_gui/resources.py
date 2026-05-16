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
  rows = request.rows or 8
  columns = request.columns or 12
  well_volume = request.well_volume or 200
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
  elif request.kind == "well":
    data.update({"well_volume": well_volume})
    python = (
      "from pylabrobot.resources import CrossSectionType, Well, WellBottomType\n\n"
      f"resource = Well({request.name!r}, size_x={request.size_x}, "
      f"size_y={request.size_y}, size_z={request.size_z}, max_volume={well_volume}, "
      "cross_section_type=CrossSectionType.CIRCLE, bottom_type=WellBottomType.FLAT)\n"
    )
  elif request.kind == "plate":
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
  elif request.kind == "tip_rack":
    data.update({"rows": rows, "columns": columns, "well_volume": well_volume})
    python = (
      "from pylabrobot.resources import TipRack, TipSpot, create_ordered_items_2d\n"
      "from pylabrobot.resources.tip import Tip\n\n"
      "def make_tip(name: str) -> Tip:\n"
      f"  return Tip(name=name, has_filter=False, total_tip_length={request.size_z * 2}, "
      f"maximal_volume={well_volume}, fitting_depth=8)\n\n"
      f"items = create_ordered_items_2d(TipSpot, num_items_x={columns}, num_items_y={rows}, "
      "dx=9, dy=9, dz=1, item_dx=9, item_dy=9, size_x=6.8, size_y=6.8, "
      "size_z=0, make_tip=make_tip)\n"
      f"resource = TipRack({request.name!r}, size_x={request.size_x}, "
      f"size_y={request.size_y}, size_z={request.size_z}, ordered_items=items)\n"
    )
  elif request.kind == "carrier":
    site_count = max(1, columns)
    data.update({"sites": site_count})
    python = (
      "from pylabrobot.resources import Carrier, Coordinate\n"
      "from pylabrobot.resources.resource_holder import ResourceHolder\n\n"
      "site_width = 127.76\n"
      "site_pitch = 135.0\n"
      "sites = {\n"
      f"  index: ResourceHolder(f'site_{{index + 1}}', size_x=site_width, size_y={request.size_y}, "
      "size_z=5, child_location=Coordinate.zero())\n"
      f"  for index in range({site_count})\n"
      "}\n"
      "for index, site in sites.items():\n"
      "  site.location = Coordinate(index * site_pitch, 0, 0)\n"
      f"resource = Carrier({request.name!r}, size_x={request.size_x}, "
      f"size_y={request.size_y}, size_z={request.size_z}, sites=sites)\n"
    )
  else:
    python = (
      "from pylabrobot.resources import Deck\n\n"
      f"resource = Deck(name={request.name!r}, size_x={request.size_x}, "
      f"size_y={request.size_y}, size_z={request.size_z})\n"
    )
  return CustomResourceResponse(python=python, json_definition=data)
