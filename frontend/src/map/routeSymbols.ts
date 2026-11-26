import type { Map } from 'maplibre-gl'

export const ARROW_ICON = 'galitrack-direction'
export const FINISH_ICON = 'galitrack-finish-flag'

export function addRouteSymbols(map: Map) {
  if (map.hasImage(ARROW_ICON) && map.hasImage(FINISH_ICON)) return

  const canvas = document.createElement('canvas')
  canvas.width = 48
  canvas.height = 48
  const context = canvas.getContext('2d')
  if (!context) return
  context.scale(2, 2)

  context.beginPath()
  context.moveTo(9, 7)
  context.lineTo(15, 12)
  context.lineTo(9, 17)
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.strokeStyle = '#26342d'
  context.lineWidth = 4
  context.stroke()
  context.strokeStyle = '#fff'
  context.lineWidth = 2
  context.stroke()
  map.addImage(ARROW_ICON, context.getImageData(0, 0, 48, 48), { pixelRatio: 2 })

  context.clearRect(0, 0, 24, 24)
  context.beginPath()
  context.arc(12, 12, 11, 0, Math.PI * 2)
  context.fillStyle = '#fff'
  context.fill()
  context.strokeStyle = '#26342d'
  context.lineWidth = 1
  context.stroke()

  context.strokeRect(7, 6, 10, 8)
  context.beginPath()
  context.moveTo(7, 6)
  context.lineTo(7, 18)
  context.stroke()
  context.fillStyle = '#26342d'
  context.fillRect(7, 6, 5, 4)
  context.fillRect(12, 10, 5, 4)
  map.addImage(FINISH_ICON, context.getImageData(0, 0, 48, 48), { pixelRatio: 2 })
}
