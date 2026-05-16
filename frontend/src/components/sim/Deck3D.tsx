import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { GeometryCatalog, TraceEvent } from "../../types";

export function Deck3D({ geometry, event }: { geometry?: GeometryCatalog; event?: TraceEvent }) {
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
    camera.lookAt(450, 300, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    host.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight("#ffffff", 1.6));
    const light = new THREE.DirectionalLight("#ffffff", 1.4);
    light.position.set(200, -300, 700);
    scene.add(light);

    const group = new THREE.Group();
    scene.add(group);
    if (geometry) {
      for (const instance of Object.values(geometry.instances)) {
        const prototype = geometry.prototypes[instance.prototype];
        if (!prototype) continue;
        const size = prototype.size;
        const pose = instance.pose ?? [0, 0, 0];
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(Math.max(1, size[0]), Math.max(1, size[1]), Math.max(1, size[2])),
          new THREE.MeshLambertMaterial({ color: colorFor(prototype.geometry?.shape, prototype.type), transparent: true, opacity: 0.82 }),
        );
        box.position.set(pose[0] + size[0] / 2, pose[1] + size[1] / 2, pose[2] + size[2] / 2);
        group.add(box);
      }
    }

    const target = targetPoint(event);
    if (target) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(8, 24, 24),
        new THREE.MeshLambertMaterial({ color: "#d42620" }),
      );
      marker.position.set(target.x, target.y, target.z);
      scene.add(marker);
    }

    renderer.render(scene, camera);
    return () => renderer.dispose();
  }, [geometry, event]);

  return <div className="deck3d" ref={ref} />;
}

function colorFor(shape: string | undefined, type: string): string {
  if (shape === "deck") return "#d8e3ed";
  if (shape === "well") return "#59a7b4";
  if (shape === "tip_spot") return "#c9a94d";
  if (type.includes("Carrier")) return "#8799a8";
  if (type.includes("Plate")) return "#4f6a7f";
  return "#8da3b4";
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

