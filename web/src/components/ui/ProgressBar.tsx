import { cn } from '@/lib/utils/cn';

interface ProgressBarProps {
  progress: number;
  message?: string;
  className?: string;
}

export function ProgressBar({ progress, message, className }: ProgressBarProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-600">{message || 'Processing...'}</span>
        <span className="text-neutral-500 font-mono">{Math.round(progress)}%</span>
      </div>
      <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-500 transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
