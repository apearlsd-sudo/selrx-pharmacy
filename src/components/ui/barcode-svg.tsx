'use client'

import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

interface BarcodeSVGProps {
  value: string
  width?: number
  height?: number
  className?: string
  displayValue?: boolean
  fontSize?: number
  margin?: number
}

/**
 * Renders an EAN-13 (or any format) barcode as SVG using JsBarcode.
 */
export function BarcodeSVG({
  value,
  width = 1.5,
  height = 40,
  className = '',
  displayValue = true,
  fontSize = 14,
  margin = 2,
}: BarcodeSVGProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: 'EAN13',
          width,
          height,
          displayValue,
          fontSize,
          margin,
          font: 'monospace',
        })
      } catch {
        // If not a valid EAN-13, try generic CODE128
        try {
          JsBarcode(svgRef.current, value, {
            format: 'CODE128',
            width,
            height,
            displayValue,
            fontSize,
            margin,
            font: 'monospace',
          })
        } catch {
          // If all fails, show nothing
        }
      }
    }
  }, [value, width, height, displayValue, fontSize, margin])

  if (!value) return null

  return <svg ref={svgRef} className={className} />
}
