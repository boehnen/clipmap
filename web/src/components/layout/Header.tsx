'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

const NAV_ITEMS = [
  { href: '/tools', label: 'Tools' },
  { href: '/maps', label: 'Cities' },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-neutral-200">
      <div className="container-page">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">CM</span>
            </div>
            <span className="font-semibold text-lg text-neutral-900">ClipMap</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  pathname.startsWith(item.href)
                    ? 'bg-neutral-100 text-neutral-900'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/tools/svg-map-generator"
              className="btn-primary text-sm"
            >
              Create Map
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
