import * as THREE from 'three'
import { getJourneyFrame } from './journey-frame'

export type DepthImage = { image: string; depth: string }

// Ported from An Lâm's scene.js: depth parallax, camera dolly and a warm transition.
const vertexShader = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`
const fragmentShader = `
precision highp float;
uniform sampler2D uColA, uDepA, uColB, uDepB;
uniform vec2 uAspectA, uAspectB, uView;
uniform float uDolly, uMix, uTime;
varying vec2 vUv;
vec2 cover(vec2 uv, vec2 s) { return (uv - 0.5) * s + 0.5; }
vec2 pom(sampler2D dep, vec2 uv, vec2 offset) {
  float layer = 1.0;
  vec2 cur = uv - offset * (layer - 0.35);
  float d = texture2D(dep, cur).r;
  float prevLayer = layer, prevD = d;
  vec2 prevUv = cur;
  for (int i = 0; i < 20; i++) {
    if (d >= layer) break;
    prevLayer = layer; prevD = d; prevUv = cur;
    layer -= 0.05;
    cur = uv - offset * (layer - 0.35);
    d = texture2D(dep, cur).r;
  }
  float a = d - layer;
  float b = prevD - prevLayer;
  return mix(cur, prevUv, clamp(a / (a - b + 0.00001), 0.0, 1.0));
}
vec3 shade(sampler2D col, sampler2D dep, vec2 aspect, float dolly, out float depth) {
  vec2 uv = cover(vUv, aspect);
  vec2 off = uView * 0.035 + (uv - 0.5) * dolly * 0.16;
  uv = cover(vUv, aspect * (1.0 - dolly * 0.12));
  vec2 p = pom(dep, uv, off);
  depth = texture2D(dep, p).r;
  vec3 c = texture2D(col, p).rgb;
  return mix(c, c * 0.92 + vec3(0.05, 0.04, 0.03), (1.0 - depth) * 0.25);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  float dA, dB;
  vec3 a = shade(uColA, uDepA, uAspectA, uDolly, dA);
  vec3 col = a;
  if (uMix > 0.0) {
    vec3 b = shade(uColB, uDepB, uAspectB, 0.0, dB);
    float n = noise(vUv * vec2(9.0, 6.0) + uTime * 0.1) * 0.35;
    float edge = (1.0 - dA) * 0.65 + n - (uMix * 1.5 - 0.25);
    float m = 1.0 - smoothstep(-0.05, 0.05, edge);
    col = mix(a, b, m);
    col += vec3(1.0, 0.79, 0.54) * (1.0 - smoothstep(0.0, 0.09, abs(edge))) * (1.0 - m) * 1.6 * step(0.001, uMix) * step(uMix, 0.999);
  }
  vec2 q = vUv - 0.5;
  col *= (1.0 - dot(q, q) * 0.55) * 0.88;
  col += (hash(vUv * 900.0 + fract(uTime) * 37.0) - 0.5) * 0.025;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

export function createDepthScene(canvas: HTMLCanvasElement, images: DepthImage[]) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const loader = new THREE.TextureLoader()
  const textures = new Set<THREE.Texture>()
  let disposed = false
  const load = (url: string, color = false) => new Promise<THREE.Texture<HTMLImageElement>>((resolve, reject) => {
    const texture = loader.load(url, (loaded) => {
      if (disposed) loaded.dispose()
      resolve(loaded)
    }, undefined, reject)
    textures.add(texture)
    if (color) texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = THREE.LinearFilter
    texture.generateMipmaps = false
  })
  const uniforms = {
    uColA: { value: null as THREE.Texture | null }, uDepA: { value: null as THREE.Texture | null },
    uColB: { value: null as THREE.Texture | null }, uDepB: { value: null as THREE.Texture | null },
    uAspectA: { value: new THREE.Vector2(1, 1) }, uAspectB: { value: new THREE.Vector2(1, 1) },
    uView: { value: new THREE.Vector2() }, uDolly: { value: 0 }, uMix: { value: 0 }, uTime: { value: 0 },
  }
  const geometry = new THREE.PlaneGeometry(2, 2)
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false })
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(geometry, material))
  const camera = new THREE.Camera()
  const pointer = new THREE.Vector2()
  const drift = new THREE.Vector2()
  let loaded: { color: THREE.Texture; depth: THREE.Texture; aspect: number }[] = []
  let progress = 0
  let active = false
  let running = false
  const fit = (aspect: number, target: THREE.Vector2) => {
    const ratio = Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight)
    target.set(ratio > aspect ? 1 : ratio / aspect, ratio > aspect ? aspect / ratio : 1)
  }
  const update = (value: number) => {
    progress = value
    const frame = getJourneyFrame(value, loaded.length)
    if (!frame || disposed) return
    const a = loaded[frame.from], b = loaded[frame.to]
    uniforms.uColA.value = a.color; uniforms.uDepA.value = a.depth
    uniforms.uColB.value = b.color; uniforms.uDepB.value = b.depth
    fit(a.aspect, uniforms.uAspectA.value); fit(b.aspect, uniforms.uAspectB.value)
    uniforms.uDolly.value = frame.dolly; uniforms.uMix.value = frame.mix
  }
  const resize = new ResizeObserver(() => {
    if (disposed) return
    renderer.setSize(Math.max(1, canvas.clientWidth), Math.max(1, canvas.clientHeight), false)
    update(progress)
  })
  resize.observe(canvas)
  const ready = Promise.all(images.map(async ({ image, depth }) => {
    const [color, map] = await Promise.all([load(image, true), load(depth)])
    return { color, depth: map, aspect: color.image.width / color.image.height }
  })).then((result) => {
    if (disposed) return
    loaded = result
    update(progress)
    syncLoop()
  })
  let previous = performance.now()
  const render = (now: number) => {
    const delta = Math.min((now - previous) / 1000, 0.05)
    previous = now
    if (disposed || !active || document.hidden || !loaded.length) return
    const time = now / 1000
    drift.set(Math.sin(time * 0.21) * 0.2, Math.cos(time * 0.17) * 0.12).add(pointer)
    uniforms.uView.value.lerp(drift, 1 - Math.exp(-3 * delta))
    uniforms.uTime.value = time
    renderer.render(scene, camera)
  }
  function syncLoop() {
    const next = !disposed && active && !document.hidden && loaded.length > 0
    if (next === running) return
    running = next
    previous = performance.now()
    renderer.setAnimationLoop(next ? render : null)
  }
  document.addEventListener('visibilitychange', syncLoop)
  return {
    ready, update,
    setPointer: (x: number, y: number) => pointer.set(x, y),
    setActive: (value: boolean) => { active = value; syncLoop() },
    dispose() {
      disposed = true
      renderer.setAnimationLoop(null)
      document.removeEventListener('visibilitychange', syncLoop)
      resize.disconnect()
      textures.forEach((texture) => texture.dispose())
      geometry.dispose(); material.dispose(); renderer.dispose()
    },
  }
}
