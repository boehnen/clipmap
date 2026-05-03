'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TOUR_STEPS, MOBILE_TOUR_STEPS } from '@/data/tourSteps';
import { TourStep } from '@/types/ui';

interface OnboardingTourProps {
  isActive: boolean;
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// Check if element is visible on screen
function isElementVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);

  // Check if element has size and is not hidden
  if (rect.width === 0 || rect.height === 0) return false;
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;

  // Check if element is within viewport
  if (rect.top > window.innerHeight || rect.bottom < 0) return false;
  if (rect.left > window.innerWidth || rect.right < 0) return false;

  return true;
}

export function OnboardingTour({
  isActive,
  currentStep,
  onNext,
  onPrev,
  onSkip,
}: OnboardingTourProps) {
  const [mounted, setMounted] = useState(false);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    // Check if mobile on mount and resize
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Use appropriate steps based on screen size
  const steps = isMobile ? MOBILE_TOUR_STEPS : TOUR_STEPS;
  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  // Find and measure target element
  const measureTarget = useCallback(() => {
    if (!step) return;

    const target = document.querySelector(step.target);

    // If target not found or not visible, use a fallback rect
    if (!target || !isElementVisible(target)) {
      // Center the spotlight as a general fallback
      setTargetRect({
        top: window.innerHeight / 2 - 75,
        left: window.innerWidth / 2 - 150,
        width: 300,
        height: 150,
      });
      return;
    }

    const rect = target.getBoundingClientRect();
    setTargetRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }, [step]);

  // Calculate tooltip position
  useEffect(() => {
    if (!targetRect || !tooltipRef.current || !step) return;

    const tooltip = tooltipRef.current;
    const tooltipRect = tooltip.getBoundingClientRect();
    const padding = 16;
    const arrowOffset = 12;

    let top = 0;
    let left = 0;

    switch (step.placement) {
      case 'top':
        top = targetRect.top - tooltipRect.height - arrowOffset;
        left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        break;
      case 'bottom':
        top = targetRect.top + targetRect.height + arrowOffset;
        left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        break;
      case 'left':
        top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        left = targetRect.left - tooltipRect.width - arrowOffset;
        break;
      case 'right':
        top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        left = targetRect.left + targetRect.width + arrowOffset;
        break;
    }

    // Keep tooltip within viewport
    top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));
    left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));

    setTooltipPosition({ top, left });
  }, [targetRect, step]);

  // Measure on mount and when step changes
  useEffect(() => {
    if (!isActive) return;

    measureTarget();

    // Also measure on resize and scroll
    const handleResize = () => measureTarget();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, [isActive, currentStep, measureTarget]);

  // Handle escape key
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSkip();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        onNext();
      } else if (e.key === 'ArrowLeft') {
        onPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, onSkip, onNext, onPrev]);

  if (!mounted || !isActive || !step || !targetRect) return null;

  const content = (
    <div className="fixed inset-0 z-[9999]" role="dialog" aria-modal="true" aria-label="Tour">
      {/* SVG mask overlay */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id="tour-spotlight">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={targetRect.left - 8}
              y={targetRect.top - 8}
              width={targetRect.width + 16}
              height={targetRect.height + 16}
              rx="8"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.6)"
          mask="url(#tour-spotlight)"
        />
      </svg>

      {/* Spotlight border */}
      <div
        className="absolute border-2 border-blue-500 rounded-lg pointer-events-none"
        style={{
          top: targetRect.top - 8,
          left: targetRect.left - 8,
          width: targetRect.width + 16,
          height: targetRect.height + 16,
          boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.3)',
        }}
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute bg-white rounded-xl shadow-2xl p-5 max-w-xs"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
        }}
      >
        {/* Arrow (simplified - points toward target) */}
        <div
          className="absolute w-3 h-3 bg-white transform rotate-45"
          style={{
            ...(step.placement === 'bottom' && { top: -6, left: '50%', marginLeft: -6 }),
            ...(step.placement === 'top' && { bottom: -6, left: '50%', marginLeft: -6 }),
            ...(step.placement === 'left' && { right: -6, top: '50%', marginTop: -6 }),
            ...(step.placement === 'right' && { left: -6, top: '50%', marginTop: -6 }),
          }}
        />

        {/* Content */}
        <h3 className="font-semibold text-neutral-900 mb-2">{step.title}</h3>
        <p className="text-sm text-neutral-600 mb-4">{step.description}</p>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {steps.map((_, index) => (
            <div
              key={index}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentStep ? 'bg-blue-500' : 'bg-neutral-200'
              }`}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onSkip}
            className="px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
          >
            Skip
          </button>
          <div className="flex-1" />
          {!isFirstStep && (
            <button
              onClick={onPrev}
              className="px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
            >
              Back
            </button>
          )}
          <button
            onClick={onNext}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
