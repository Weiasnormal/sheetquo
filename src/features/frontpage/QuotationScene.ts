import * as THREE from 'three'
import { SAMPLE, amount, subtotal, total } from './sample'

function documentTexture(stage: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 960; canvas.height = 1200
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 960, 1200)
  const text = (value: string, x: number, y: number, size = 24, weight = 400, color = '#1f2937') => {
    ctx.font = `${weight} ${size}px "Inter Variable", sans-serif`; ctx.fillStyle = color; ctx.fillText(value, x, y)
  }
  const line = (y: number) => { ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(64, y); ctx.lineTo(896, y); ctx.stroke() }
  ctx.fillStyle = '#a8f047'; ctx.fillRect(0, 0, 960, 15)
  text('PARTS & SERVICE', 64, 112, 24, 650)
  text('Quotation', 64, 190, 64, 650)
  text('DEMO-001', 720, 180, 22, 500)
  line(236)
  text('PREPARED FOR', 64, 296, 18, 600, '#6b7280')
  text(stage === 0 ? 'Your customer' : SAMPLE.customer, 64, 342, 32, 600)
  text('YOUR TEMPLATE · YOUR LAYOUT', 64, 393, 19, 400, '#6b7280')
  ctx.fillStyle = '#eafbd7'; ctx.fillRect(64, 450, 832, 64)
  text('Description', 84, 491, 21, 600); text('Qty', 510, 491, 21, 600)
  text('Price', 618, 491, 21, 600); text('Amount', 772, 491, 21, 600)
  SAMPLE.items.forEach((item, i) => {
    const y = 565 + i * 91
    if (stage === 1 && i === 0) { ctx.fillStyle = '#f4fbe9'; ctx.fillRect(64, y - 32, 832, 76) }
    text(stage === 0 ? ['Item description', 'Item description', 'Labor'][i] : item.name, 84, y, 24)
    text(stage === 0 ? '—' : String(item.quantity), 520, y, 24)
    ctx.textAlign = 'right'
    text(stage === 0 ? '—' : amount(item.price), 704, y, 23)
    text(stage === 0 ? '—' : amount(item.quantity * item.price), 877, y, 23)
    ctx.textAlign = 'left'; line(y + 38)
  })
  text('Subtotal', 490, 867, 23); text('Discount', 490, 918, 23)
  ctx.textAlign = 'right'
  text(stage === 0 ? '—' : amount(subtotal), 877, 867, 23)
  text(stage === 0 ? '—' : `−${amount(SAMPLE.discount)}`, 877, 918, 23)
  ctx.textAlign = 'left'
  ctx.fillStyle = '#a8f047'; ctx.fillRect(64, 966, 832, 102)
  text('TOTAL', 87, 1029, 24, 650)
  ctx.textAlign = 'right'; text(stage === 0 ? '—' : `PHP ${amount(total)}`, 874, 1033, 37, 650)
  ctx.textAlign = 'left'; text('Sample data · Editable Excel output', 64, 1141, 20, 400, '#6b7280')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Demand-rendered scene: no ambient animation, external model, CDN or user data. */
export function createQuotationScene(host: HTMLElement, initialStage: number, onLost: () => void) {
  // Keep the settled frame available when the browser recomposites this demand-rendered canvas.
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0x000000, 0)
  renderer.domElement.setAttribute('aria-hidden', 'true')
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-3.4, 3.4, 3.1, -3.1, .1, 40)
  camera.position.set(0, 0, 10)
  const group = new THREE.Group(); scene.add(group)
  const shape = new THREE.Shape(), w = 3.75, h = 4.72, r = .11
  shape.moveTo(-w / 2 + r, -h / 2)
  shape.lineTo(w / 2 - r, -h / 2); shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
  shape.lineTo(w / 2, h / 2 - r); shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
  shape.lineTo(-w / 2 + r, h / 2); shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
  shape.lineTo(-w / 2, -h / 2 + r); shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
  const paperGeometry = new THREE.ExtrudeGeometry(shape, { depth: .035, bevelEnabled: true, bevelSize: .005, bevelThickness: .005, bevelSegments: 1, steps: 1 })
  const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 })
  const lime = new THREE.MeshStandardMaterial({ color: '#a8f047', roughness: .85 })
  for (let i = 2; i >= 0; i--) {
    const paper = new THREE.Mesh(paperGeometry, i === 2 ? lime : white)
    paper.position.set(i * .11, -i * .06, -i * .14)
    paper.rotation.z = i * -.035; group.add(paper)
  }
  let texture = documentTexture(initialStage)
  const faceGeometry = new THREE.PlaneGeometry(w - .025, h - .025)
  const faceMaterial = new THREE.MeshBasicMaterial({ map: texture })
  const face = new THREE.Mesh(faceGeometry, faceMaterial); face.position.z = .045; group.add(face)
  scene.add(new THREE.AmbientLight(0xffffff, 2.4))
  const light = new THREE.DirectionalLight(0xffffff, 2)
  light.position.set(-4, 6, 8); scene.add(light)
  let stage = initialStage, px = 0, py = 0, frame = 0, visible = true, disposed = false
  group.rotation.set(.13, -.2, -.075)
  const render = () => {
    frame = 0
    if (disposed || !visible || document.hidden) return
    const x = .13 + py * .10, y = (stage === 0 ? -.36 : stage === 2 ? -.08 : -.2) + px * .14
    group.rotation.x += (x - group.rotation.x) * .16
    group.rotation.y += (y - group.rotation.y) * .16
    renderer.render(scene, camera)
    if (Math.abs(x - group.rotation.x) + Math.abs(y - group.rotation.y) > .001) frame = requestAnimationFrame(render)
  }
  const request = () => { if (!frame && !disposed && visible && !document.hidden) frame = requestAnimationFrame(render) }
  const resize = () => {
    const { width, height } = host.getBoundingClientRect()
    if (!width || !height) return
    renderer.setSize(width, height)
    const aspect = width / height, extent = 2.94
    camera.left = -extent * aspect; camera.right = extent * aspect; camera.top = extent; camera.bottom = -extent
    camera.updateProjectionMatrix()
    // setSize clears the drawing buffer; paint immediately, including background-tab resizes.
    renderer.render(scene, camera); request()
  }
  const move = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    const rect = host.getBoundingClientRect(); px = (event.clientX - rect.left) / rect.width - .5; py = (event.clientY - rect.top) / rect.height - .5; request()
  }
  const leave = () => { px = 0; py = 0; request() }
  const hidden = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0 } else request() }
  const lost = (event: Event) => { event.preventDefault(); onLost() }
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host)
  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (!visible) { cancelAnimationFrame(frame); frame = 0 } else request() }); intersection.observe(host)
  host.addEventListener('pointermove', move); host.addEventListener('pointerleave', leave)
  document.addEventListener('visibilitychange', hidden)
  renderer.domElement.addEventListener('webglcontextlost', lost)
  host.appendChild(renderer.domElement); resize()
  return {
    setStage(value: number) { stage = value; const previous = texture; texture = documentTexture(stage); faceMaterial.map = texture; faceMaterial.needsUpdate = true; previous.dispose(); request() },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); resizeObserver.disconnect(); intersection.disconnect()
      host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', leave)
      document.removeEventListener('visibilitychange', hidden); renderer.domElement.removeEventListener('webglcontextlost', lost)
      texture.dispose(); paperGeometry.dispose(); faceGeometry.dispose(); 
      white.dispose(); lime.dispose(); faceMaterial.dispose(); renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
