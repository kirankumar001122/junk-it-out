'use client';

import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export type GlossyButtonVariant =
  | 'primary'
  | 'dark'
  | 'secondary'
  | 'danger'
  | 'amber'
  | 'blue'
  | 'ghost';

export type GlossyButtonShape = 'pill' | 'curved' | 'curved-lg' | 'default';
export type GlossyButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon';

export interface GlossyButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: GlossyButtonVariant;
  shape?: GlossyButtonShape;
  size?: GlossyButtonSize;
  loading?: boolean;
  loadingText?: string;
  icon?: React.ReactNode;
}

const variantClasses: Record<GlossyButtonVariant, string> = {
  primary: 'btn-glossy-primary',
  dark: 'btn-glossy-dark',
  secondary: 'btn-glossy-secondary',
  danger: 'btn-glossy-danger',
  amber: 'btn-glossy-amber',
  blue: 'btn-glossy-blue',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-700 active:scale-95 transition-all',
};

const shapeClasses: Record<GlossyButtonShape, string> = {
  pill: 'rounded-pill',
  curved: 'rounded-curved-md',
  'curved-lg': 'rounded-curved-lg',
  default: 'rounded-pill',
};

const sizeClasses: Record<GlossyButtonSize, string> = {
  xs: 'h-8 px-3 text-xs',
  sm: 'h-9 px-3.5 text-xs font-bold',
  md: 'h-11 px-5 text-sm font-bold',
  lg: 'h-13 px-6 text-base font-extrabold',
  icon: 'h-10 w-10 p-0 shrink-0 grid place-items-center',
};

export const GlossyButton = forwardRef<HTMLButtonElement, GlossyButtonProps>(
  (
    {
      children,
      className = '',
      variant = 'primary',
      shape = 'pill',
      size = 'md',
      loading = false,
      loadingText,
      disabled,
      icon,
      ...props
    },
    ref
  ) => {
    const isGhost = variant === 'ghost';
    const baseClass = isGhost ? 'btn-ghost' : 'btn-glossy';
    const variantClass = variantClasses[variant] || variantClasses.primary;
    const shapeClass = shapeClasses[shape] || shapeClasses.pill;
    const sizeClass = sizeClasses[size] || sizeClasses.md;

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseClass} ${variantClass} ${shapeClass} ${sizeClass} ${className}`.trim()}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            {loadingText || children}
          </>
        ) : (
          <>
            {icon && <span className="shrink-0">{icon}</span>}
            {children}
          </>
        )}
      </button>
    );
  }
);

GlossyButton.displayName = 'GlossyButton';

export default GlossyButton;
