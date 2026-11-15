import { Menu, X } from 'lucide-react'
import { Dialog } from 'radix-ui'
import { useState } from 'react'
import { Logo } from './Logo'
import { NavContent } from './NavContent'
import { WiwoSlot } from '../../features/wiwo/WiwoToggle'

export function MobileBar() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-ground px-4 sm:px-6 lg:justify-end lg:border-transparent lg:bg-ground/90 lg:px-9 lg:backdrop-blur">
      <div className="mr-auto lg:hidden"><Logo /></div>
      <WiwoSlot className="flex items-center" />
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger
          data-wiwo="mobile-menu"
          aria-label="Open menu"
          className="-mr-2 flex size-11 items-center justify-center rounded-button text-ink lg:hidden"
        >
          <Menu className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="sheet-overlay fixed inset-0 z-30 bg-ink/40" />
          <Dialog.Content
            aria-describedby={undefined}
            className="sheet-panel fixed inset-y-0 left-0 z-40 w-full max-w-sm overflow-y-auto bg-ground shadow-lg"
          >
            <Dialog.Title className="sr-only">Menu</Dialog.Title>
            <NavContent onNavigate={close} />
            <Dialog.Close
              aria-label="Close menu"
              className="absolute top-2.5 right-2 flex size-11 items-center justify-center rounded-button text-ink"
            >
              <X className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </header>
  )
}
