import { useState } from 'react';
import { cn } from '@/lib/utils';

export function Logo({ className, size = 40 }: { className?: string; size?: number }) {
  // Prefer an official PNG if dropped into /public/assets, else fall back to the SVG seal.
  const [src, setSrc] = useState('/assets/dyci-logo.png');
  return (
    <img
      src={src}
      onError={() => setSrc('/assets/dyci-logo.svg')}
      width={size}
      height={size}
      alt="Dr. Yanga's Colleges, Inc."
      className={cn('select-none rounded-full object-contain', className)}
      draggable={false}
    />
  );
}

export function LogoWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={compact ? 34 : 40} />
      {!compact && (
        <div className="leading-tight">
          <div className="font-display text-[15px] font-extrabold text-navy-800 dark:text-white">DYCI · DMS</div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-gold-600 dark:text-gold-300">
            Document Management
          </div>
        </div>
      )}
    </div>
  );
}
