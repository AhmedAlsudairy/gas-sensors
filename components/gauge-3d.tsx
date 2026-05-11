"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

class ArcCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly radius: number,
    private readonly startAngle: number,
    private readonly endAngle: number
  ) {
    super();
  }
  getPoint(t: number): THREE.Vector3 {
    const a = this.startAngle + (this.endAngle - this.startAngle) * t;
    return new THREE.Vector3(Math.cos(a) * this.radius, Math.sin(a) * this.radius, 0);
  }
}

function toHex(s: string): number {
  return parseInt(s.replace("#", ""), 16);
}

export interface Gauge3DProps {
  ppm: number;
  maxPpm: number;
  statusColor: string;
  baseColor: string;
  dark: boolean;
  className?: string;
}

interface SceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
  filledMesh: THREE.Mesh | null;
  pointLight: THREE.PointLight;
  rafId: number;
}

export function Gauge3D({ ppm, maxPpm, statusColor, baseColor, dark, className }: Gauge3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<SceneState | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const W = el.clientWidth || 160;
    const H = el.clientHeight || 160;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 50);
    camera.position.z = 6.5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    // Resize observer — keep canvas in sync with container
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    });
    ro.observe(el);

    const group = new THREE.Group();
    scene.add(group);

    const trackMat = new THREE.MeshStandardMaterial({
      color: dark ? 0x1e293b : 0xdde4f0,
      metalness: 0.5,
      roughness: 0.5,
    });
    group.add(new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.13, 16, 128), trackMat));

    for (let i = 0; i <= 8; i++) {
      const a = -Math.PI * 0.75 + (Math.PI * 1.5 / 8) * i;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshStandardMaterial({ color: dark ? 0x334155 : 0xb0bec5 })
      );
      dot.position.set(Math.cos(a) * 1.85, Math.sin(a) * 1.85, 0);
      group.add(dot);
    }

    group.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.44, 32, 32),
        new THREE.MeshStandardMaterial({
          color: toHex(baseColor),
          metalness: 0.9,
          roughness: 0.1,
          emissive: toHex(baseColor),
          emissiveIntensity: 0.25,
        })
      )
    );

    group.add(
      new THREE.Mesh(
        new THREE.TorusGeometry(1.5, 0.022, 8, 128),
        new THREE.MeshBasicMaterial({ color: toHex(baseColor), transparent: true, opacity: 0.35 })
      )
    );

    scene.add(new THREE.AmbientLight(0xffffff, dark ? 0.35 : 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, dark ? 1.0 : 1.6);
    dir.position.set(3, 4, 5);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0x8888ff, 0.4);
    fill.position.set(-3, -2, 2);
    scene.add(fill);

    const pointLight = new THREE.PointLight(toHex(baseColor), 3, 10);
    pointLight.position.set(0, 0, 3);
    scene.add(pointLight);

    const startTime = Date.now();
    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const t = (Date.now() - startTime) * 0.001;
      group.rotation.y = t * 0.38;
      group.rotation.x = Math.sin(t * 0.65) * 0.1;
      renderer.render(scene, camera);
    };
    animate();

    stateRef.current = { renderer, scene, camera, group, filledMesh: null, pointLight, rafId };

    return () => {
      ro.disconnect();
      cancelAnimationFrame(rafId);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      stateRef.current = null;
    };
  }, [dark, baseColor]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;

    if (s.filledMesh) {
      s.group.remove(s.filledMesh);
      s.filledMesh.geometry.dispose();
      (s.filledMesh.material as THREE.Material).dispose();
      s.filledMesh = null;
    }

    const pct = Math.min(Math.max(ppm / maxPpm, 0), 1);
    if (pct < 0.005) return;

    const a0 = -Math.PI * 0.75;
    const a1 = a0 + Math.PI * 1.5 * pct;
    const curve = new ArcCurve(1.5, a0, a1);
    const geom = new THREE.TubeGeometry(curve, 128, 0.155, 12, false);
    const mat = new THREE.MeshStandardMaterial({
      color: toHex(statusColor),
      emissive: toHex(statusColor),
      emissiveIntensity: dark ? 0.7 : 0.4,
      metalness: 0.15,
      roughness: 0.3,
    });
    const mesh = new THREE.Mesh(geom, mat);
    s.group.add(mesh);
    s.filledMesh = mesh;
    s.pointLight.color.set(statusColor);
  }, [ppm, maxPpm, statusColor, dark]);

  return (
    <div
      ref={containerRef}
      className={className ?? "w-full aspect-square"}
      style={{ flexShrink: 0 }}
    />
  );
}
