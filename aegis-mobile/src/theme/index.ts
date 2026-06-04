/**
 * Aegis Design System
 * ====================
 * Centralized design tokens for premium dark-mode UI.
 * Used across all screens and components.
 */

export const Colors = {
  // Core backgrounds
  bg: {
    primary: '#050510',
    secondary: '#0A0A1A',
    tertiary: '#111128',
    card: '#0F0F24',
    elevated: '#161636',
  },

  // Accent colors
  accent: {
    primary: '#6C5CE7',       // Electric purple
    secondary: '#00D2FF',     // Cyan
    tertiary: '#A78BFA',      // Lavender
    success: '#00E676',       // Neon green
    warning: '#FFB74D',       // Amber
    danger: '#FF5252',        // Red
    info: '#64B5F6',          // Sky blue
  },

  // Gradients
  gradient: {
    primary: ['#6C5CE7', '#A78BFA'] as const,
    success: ['#00E676', '#00BFA5'] as const,
    danger: ['#FF5252', '#FF1744'] as const,
    cyber: ['#00D2FF', '#6C5CE7'] as const,
    shimmer: ['transparent', 'rgba(255,255,255,0.05)', 'transparent'] as const,
  },

  // Text
  text: {
    primary: '#FFFFFF',
    secondary: 'rgba(255, 255, 255, 0.7)',
    tertiary: 'rgba(255, 255, 255, 0.4)',
    accent: '#A78BFA',
    inverse: '#050510',
  },

  // Borders
  border: {
    subtle: 'rgba(255, 255, 255, 0.06)',
    medium: 'rgba(255, 255, 255, 0.12)',
    accent: 'rgba(108, 92, 231, 0.4)',
  },

  // Status ring colors
  liveness: {
    scanning: 'rgba(108, 92, 231, 0.7)',
    passed: 'rgba(0, 230, 118, 0.8)',
    failed: 'rgba(255, 82, 82, 0.8)',
    pending: 'rgba(255, 183, 77, 0.7)',
  },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const FontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  base: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 36,
  display: 48,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
} as const;

export const Shadow = {
  card: {
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  glow: {
    shadowColor: '#00D2FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  success: {
    shadowColor: '#00E676',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;
