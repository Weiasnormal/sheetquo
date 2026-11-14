type WiwoArrowProps = { size?: number; className?: string }

// A solid pointer with a light rim so it stays readable on any background.
export function WiwoArrow({ size = 16, className }: WiwoArrowProps) {
  return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" className={className}>
    <path className="wiwo-arrow-rim" d="M4 2.8v16.6l4.6-4.3 3.1 6.6 3.3-1.5-3.1-6.5 6.3-.3z" />
    <path className="wiwo-arrow-body" d="M4 2.8v16.6l4.6-4.3 3.1 6.6 3.3-1.5-3.1-6.5 6.3-.3z" />
  </svg>
}
