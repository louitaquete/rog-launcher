import { useEffect, useRef } from "react";
import * as THREE from "three";
import { PlayerAnimation, SkinViewer, type PlayerObject } from "skinview3d";
import type { SkinVariant } from "../lib/api";

/** Sentado, respirando devagar, olhando pros lados e balançando o pé. */
class SitIdle extends PlayerAnimation {
  yaw = 0;
  protected animate(player: PlayerObject): void {
    const t = this.progress;
    player.rotation.y = this.yaw;
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

function buildWorld(scene: THREE.Scene, yaw: number) {
  const world = new THREE.Group();
  const box = new THREE.BoxGeometry(16, 16, 16);
  const r = rng(11);
  const mat = (hex: number) => new THREE.MeshLambertMaterial({ color: hex });
  const stone = [mat(0x5f5f66), mat(0x55555c), mat(0x6a6a71), mat(0x4c4c53)];
  const ground = [mat(0x26262c), mat(0x222228), mat(0x2a2a30)];

  // Bloco de pedra atrás das costas (2 de largura, 2 de altura)
  const set = new THREE.Group();
  for (const [x, y] of [[-1, 0], [0, 0], [0, 1], [1, 0]] as const) {
    const m = new THREE.Mesh(box, stone[Math.floor(r() * stone.length)]);
    m.position.set(x * 16 + 6, -16 + y * 16, -16);
    set.add(m);
  }
  // Chão: uma faixa de blocos sob o player, que some na névoa
  for (let x = -4; x <= 3; x++)
    for (let z = -2; z <= 3; z++) {
      const m = new THREE.Mesh(box, ground[Math.floor(r() * ground.length)]);
      m.position.set(x * 16, -32, z * 16 - 6);
      set.add(m);
    }
  set.rotation.y = yaw;
  world.add(set);

  // Partículas do void
  const N = 160;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (r() - 0.5) * 500;
    pos[i * 3 + 1] = (r() - 0.2) * 260;
    pos[i * 3 + 2] = -80 - r() * 300;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, transparent: true, opacity: 0.35 }));
  world.add(pts);

  scene.add(world);
  scene.fog = new THREE.Fog(0x0e0e10, 90, 260);
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
    v.fov = 30;
    v.zoom = 1;
    v.globalLight.intensity = 2.4;
    v.cameraLight.intensity = 0.7;
    const yaw = -1.0; // de lado, pernas apontando pra esquerda da tela
    v.playerObject.position.set(0, -14, 0);
    v.playerObject.rotation.y = yaw;
    const anim = new SitIdle();
    anim.yaw = yaw;
    v.animation = anim;
    v.controls.enabled = false;
    v.controls.enableZoom = false;
    // Câmera perto, com o player à direita do quadro
    v.camera.position.set(-14, 6, 112);
    v.controls.target.set(-30, -6, 0);
    v.controls.update();
    v.camera.lookAt(-30, -6, 0);
    const { pts } = buildWorld(v.scene, yaw);
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
    // Encosta o player no chão (topo dos blocos em y = -24), seja qual for a pose.
    const settle = () =>
      requestAnimationFrame(() => {
        const b = new THREE.Box3().setFromObject(v.playerObject);
        if (isFinite(b.min.y)) v.playerObject.position.y += -24 - b.min.y;
      });
    const p = skin ? v.loadSkin(skin, { model: variant === "slim" ? "slim" : "default" }).catch(fallback) : fallback();
    Promise.resolve(p).then(() => setTimeout(settle, 120));
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
