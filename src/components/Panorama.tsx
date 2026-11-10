import { useEffect, useRef } from "react";
import * as THREE from "three";
import { PlayerAnimation, SkinViewer, type PlayerObject } from "skinview3d";
import type { SkinVariant } from "../lib/api";

/** Sentado, respirando devagar, olhando pros lados e balançando o pé. */
class SitIdle extends PlayerAnimation {
  protected animate(player: PlayerObject): void {
    const t = this.progress;
    const s = player.skin;
    // Pernas pra frente (sentado no chão)
    s.leftLeg.rotation.x = -Math.PI / 2 + 0.08;
    s.leftLeg.rotation.z = 0.12;
    s.rightLeg.rotation.x = -Math.PI / 2 + 0.22 + Math.sin(t * 1.1) * 0.05;
    s.rightLeg.rotation.z = -0.1 + Math.sin(t * 1.1) * 0.03;
    // Respiração (ciclo de ~4 s)
    const b = Math.sin(t * 1.55);
    s.body.rotation.x = -0.06 + b * 0.012;
    // Braços apoiados, acompanhando a respiração
    s.leftArm.rotation.x = -0.55 + b * 0.02;
    s.rightArm.rotation.x = -0.5 + b * 0.02;
    s.leftArm.rotation.z = 0.08 + b * 0.012;
    s.rightArm.rotation.z = -0.08 - b * 0.012;
    // Olhar: fica parado, vira devagar pra um lado, volta, vira pro outro
    const cycle = (t * 0.16) % 4;
    const ease = (x: number) => 0.5 - Math.cos(Math.min(1, Math.max(0, x)) * Math.PI) / 2;
    const look = cycle < 1 ? ease(cycle) * 0.55 : cycle < 2 ? 0.55 - ease(cycle - 1) * 0.55 : cycle < 3 ? -ease(cycle - 2) * 0.45 : -0.45 + ease(cycle - 3) * 0.45;
    s.head.rotation.y = look;
    s.head.rotation.x = -0.08 + b * 0.015 + Math.sin(t * 0.37) * 0.04;
  }
}

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function buildWorld(scene: THREE.Scene) {
  const world = new THREE.Group();
  const box = new THREE.BoxGeometry(8, 8, 8);
  const mat = (hex: number) => new THREE.MeshLambertMaterial({ color: hex });
  const top = [mat(0x2c2c33), mat(0x303038), mat(0x282830)];
  const dirt = [mat(0x1d1d22), mat(0x202026)];
  const stone = [mat(0x6a6a72), mat(0x5b5b63), mat(0x75757d), mat(0x505058)];
  const r = rng(7);

  // Ilha principal: disco de blocos que afunila pra baixo
  const R = 5;
  for (let layer = 0; layer < 5; layer++) {
    const rad = R - layer * 1.1;
    for (let x = -R; x <= R; x++)
      for (let z = -R; z <= R; z++) {
        const d = Math.hypot(x, z * 1.15);
        if (d > rad + (r() - 0.5) * 0.8) continue;
        const m = new THREE.Mesh(box, layer === 0 ? top[Math.floor(r() * top.length)] : dirt[Math.floor(r() * dirt.length)]);
        m.position.set(x * 8, -20 - layer * 8, z * 8);
        world.add(m);
      }
  }
  // Pedra atrás do player
  const rock: [number, number, number][] = [
    [0, 0, -2], [1, 0, -2], [-1, 0, -2], [0, 1, -2], [1, 1, -2], [0, 2, -2],
    [0, 0, -3], [1, 0, -3], [-1, 0, -3], [2, 0, -3], [0, 1, -3], [1, 1, -3], [-1, 1, -3], [0, 2, -3], [1, 2, -3],
  ];
  for (const [x, y, z] of rock) {
    const m = new THREE.Mesh(box, stone[Math.floor(r() * stone.length)]);
    m.position.set(x * 8 + 4, -12 + y * 8, z * 8 + 4);
    world.add(m);
  }
  // Ilhas pequenas ao longe
  const far = [
    [-150, 30, -220, 3], [170, 60, -260, 2], [120, -40, -160, 2], [-90, 80, -300, 2], [230, 0, -320, 3],
  ];
  for (const [x, y, z, n] of far) {
    for (let i = -n; i <= n; i++)
      for (let k = -n; k <= n; k++) {
        if (Math.hypot(i, k) > n + 0.2) continue;
        const m = new THREE.Mesh(box, top[0]);
        m.position.set(x + i * 8, y, z + k * 8);
        world.add(m);
        if (Math.hypot(i, k) < n - 0.8) {
          const d = new THREE.Mesh(box, dirt[0]);
          d.position.set(x + i * 8, y - 8, z + k * 8);
          world.add(d);
        }
      }
  }
  // Partículas do void
  const N = 260;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (r() - 0.5) * 700;
    pos[i * 3 + 1] = (r() - 0.3) * 400;
    pos[i * 3 + 2] = -60 - r() * 400;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, transparent: true, opacity: 0.45, sizeAttenuation: true }));
  world.add(pts);

  scene.add(world);
  scene.fog = new THREE.Fog(0x0b0b0d, 180, 520);
  return { world, pts };
}

/** Skin cinza do Rog para quem ainda não entrou na conta. */
function defaultSkin(): string {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#9a9a9a"; g.fillRect(0, 0, 64, 64); // corpo
  g.fillStyle = "#c9c9c9"; g.fillRect(0, 0, 32, 16); // cabeça
  g.fillStyle = "#3a3a3a"; g.fillRect(8, 0, 16, 8); g.fillRect(0, 8, 32, 3); // cabelo
  g.fillStyle = "#1a1a1a"; g.fillRect(10, 12, 2, 1); g.fillRect(13, 12, 2, 1); // olhos
  g.fillStyle = "#5a5a5a"; g.fillRect(0, 16, 16, 16); g.fillRect(16, 48, 16, 16); // pernas
  g.fillStyle = "#e6e6e6"; g.fillRect(16, 16, 24, 16); // camiseta
  g.clearRect(32, 0, 32, 16); g.clearRect(0, 32, 64, 16); g.clearRect(0, 48, 16, 16); g.clearRect(48, 48, 16, 16); // camadas externas vazias
  return c.toDataURL();
}

/** Cena do modo panorâmico: player sentado encostado numa pedra, no void do Rog. */
export function Panorama({ skin, variant, paused }: { skin: string | null; variant: SkinVariant; paused?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<SkinViewer | null>(null);

  useEffect(() => {
    const el = box.current!;
    const v = new SkinViewer({ canvas: canvas.current!, width: el.clientWidth || 800, height: el.clientHeight || 500 });
    v.background = null;
    v.fov = 38;
    v.zoom = 0.42;
    v.globalLight.intensity = 2.2;
    v.cameraLight.intensity = 0.9;
    v.playerObject.position.set(0, -8, 0);
    v.playerObject.rotation.y = 0.25;
    v.animation = new SitIdle();
    v.animation.speed = 1;
    v.controls.enableZoom = false;
    v.controls.enablePan = false;
    v.controls.minPolarAngle = Math.PI * 0.32;
    v.controls.maxPolarAngle = Math.PI * 0.52;
    v.controls.minAzimuthAngle = -0.7;
    v.controls.maxAzimuthAngle = 0.7;
    v.controls.target.set(0, -2, 0);
    v.camera.position.set(-60, 22, 150);
    v.controls.update();
    const { pts } = buildWorld(v.scene);
    let raf = 0;
    const drift = () => {
      pts.rotation.y += 0.00025;
      raf = requestAnimationFrame(drift);
    };
    drift();
    viewer.current = v;

    const ro = new ResizeObserver(() => v.setSize(Math.max(100, el.clientWidth), Math.max(100, el.clientHeight)));
    ro.observe(el);
    // Não gasta GPU com a janela sem foco.
    const blur = () => (v.renderPaused = true);
    const focus = () => (v.renderPaused = false);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      v.dispose();
      viewer.current = null;
    };
  }, []);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    const fallback = () => v.loadSkin(defaultSkin(), { model: "default" });
    if (skin) v.loadSkin(skin, { model: variant === "slim" ? "slim" : "default" }).catch(fallback);
    else fallback();
  }, [skin, variant]);

  useEffect(() => {
    if (viewer.current) viewer.current.renderPaused = !!paused;
  }, [paused]);

  return (
    <div ref={box} className="absolute inset-0 cursor-grab active:cursor-grabbing">
      <canvas ref={canvas} />
    </div>
  );
}
