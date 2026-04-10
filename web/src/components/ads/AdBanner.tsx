'use client';

import { useEffect, useRef } from 'react';

interface AdBannerProps {
  slot: string;
  format?: 'auto' | 'rectangle' | 'horizontal' | 'vertical';
  className?: string;
}

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

export function AdBanner({ slot, format = 'auto', className = '' }: AdBannerProps) {
  const adRef = useRef<HTMLModElement>(null);
  const isLoaded = useRef(false);

  useEffect(() => {
    if (isLoaded.current) return;

    try {
      if (typeof window !== 'undefined' && window.adsbygoogle) {
        window.adsbygoogle.push({});
        isLoaded.current = true;
      }
    } catch (err) {
      console.error('Ad failed to load:', err);
    }
  }, []);

  const formatStyles: Record<string, string> = {
    auto: 'min-h-[100px]',
    rectangle: 'w-[300px] h-[250px]',
    horizontal: 'w-full h-[90px]',
    vertical: 'w-[160px] h-[600px]',
  };

  return (
    <div className={`ad-container ${formatStyles[format]} ${className}`}>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
        data-ad-slot={slot}
        data-ad-format={format === 'auto' ? 'auto' : undefined}
        data-full-width-responsive={format === 'auto' ? 'true' : undefined}
      />
    </div>
  );
}

export function AdPlaceholder({ className = '' }: { className?: string }) {
  return (
    <div
      className={`bg-neutral-100 rounded-lg flex items-center justify-center text-neutral-400 text-sm ${className}`}
    >
      Advertisement
    </div>
  );
}
