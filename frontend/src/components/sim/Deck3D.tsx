import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { CompactResource, GeometryCatalog, TraceEvent } from "../../types";

type RenderBox = {
  name: string;
  type: string;
  category?: string | null;
  shape?: string;
  size: number[];
  pose: number[];
};

export function Deck3D({
  geometry,
  resources,
  event,
}: {
  geometry?: GeometryCatalog;
  resources?: Record<string, CompactResource>;
  event?: TraceEvent;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.innerHTML = "";
    const width = host.clientWidth || 640;
    const height = host.clientHeight || 420;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f7fafc");

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
    camera.position.set(620, -900, 620);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(450, 300, 0);

    scene.add(new THREE.AmbientLight("#ffffff", 1.5));
    const light = new THREE.DirectionalLight("#ffffff", 1.6);
    light.position.set(250, -350, 700);
    scene.add(light);

    const boxes = collectBoxes(geometry, resources);
    const group = new THREE.Group();
    scene.add(group);
    for (const item of boxes) {
      const size = item.size;
      const pose = item.pose;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(1, size[0]), Math.max(1, size[1]), Math.max(1, size[2])),
        new THREE.MeshLambertMaterial({
          color: colorFor(item.shape, item.type, item.category),
          transparent: item.category === "well" || item.category === "tip_spot",
          opacity: item.category === "well" || item.category === "tip_spot" ? 0.62 : 0.86,
        }),
      );
      box.position.set(pose[0] + size[0] / 2, pose[1] + size[1] / 2, pose[2] + size[2] / 2);
      group.add(box);
    }

    const target = targetPoint(event);
    if (target) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(8, 24, 24),
        new THREE.MeshLambertMaterial({ color: "#c9322a" }),
      );
      marker.position.set(target.x, target.y, target.z + 10);
      scene.add(marker);
    }

    const bounds = new THREE.Box3().setFromObject(group);
    if (!bounds.isEmpty()) {
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      controls.target.copy(center);
      const distance = Math.max(size.x, size.y, size.z, 350) * 1.25;
      camera.position.set(center.x + distance * 0.65, center.y - distance, center.z + distance * 0.65);
    }
    camera.lookAt(controls.target);

    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = host.clientWidth || width;
      const nextHeight = host.clientHeight || height;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    });
    resizeObserver.observe(host);

    let animationFrame = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      host.innerHTML = "";
    };
  }, [geometry, resources, event]);

  return <div className="deck3d" ref={ref} />;
}

function collectBoxes(
  geometry?: GeometryCatalog,
  resources?: Record<string, CompactResource>,
): RenderBox[] {
  if (geometry && Object.keys(geometry.instances).length > 0) {
    return Object.entries(geometry.instances).flatMap(([name, instance]) => {
      const prototype = geometry.prototypes[instance.prototype];
      if (!prototype) return [];
      return [
        {
          name,
          type: prototype.type,
          category: prototype.category,
          shape: prototype.geometry?.shape,
          size: prototype.size,
          pose: instance.pose ?? [0, 0, 0],
        },
      ];
    });
  }

  return Object.entries(resources ?? {})
    .filter(([, resource]) => resource.absolute_location && resource.size)
    .map(([name, resource]) => ({
      name,
      type: resource.type,
      category: resource.category,
      size: resource.size,
      pose: resource.absolute_location ?? [0, 0, 0],
    }));
}

function colorFor(shape: string | undefined, type: string, category?: string | null): string {
  if (shape === "deck" || category === "deck") return "#d8e3ed";
  if (shape === "well" || category === "well") return "#41a6b6";
  if (shape === "tip_spot" || category === "tip_spot") return "#d2b04d";
  if (type.includes("Carrier") || category?.includes("carrier")) return "#7f929e";
  if (type.includes("Plate") || category === "plate") return "#4d6d7f";
  return "#8ea4b2";
}

function targetPoint(event?: TraceEvent): { x: number; y: number; z: number } | null {
  const target = event?.target;
  if (Array.isArray(target)) return { x: target[0], y: target[1], z: target[2] ?? 0 };
  if (target && typeof target === "object" && typeof target.x === "number" && typeof target.y === "number") {
    return { x: target.x, y: target.y, z: typeof target.z === "number" ? target.z : 0 };
  }
  const channel = event?.channels?.[0];
  if (channel?.target) return { x: channel.target[0], y: channel.target[1], z: channel.target[2] ?? 0 };
  return null;
}
