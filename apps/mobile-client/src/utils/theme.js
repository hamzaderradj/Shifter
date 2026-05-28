// ── Couleurs ──────────────────────────────────────────────────
export const COLORS = {
  primary: '#3B82F6',
  primaryLight: '#EFF6FF',
  primaryDark: '#1D4ED8',
  secondary: '#111827',
  white: '#FFFFFF',
  background: '#F9FAFB',
  card: '#FFFFFF',
  border: '#E5E7EB',

  // gray as object — requis par les écrans existants (COLORS.gray[500] etc.)
  gray: {
    50:  '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },

  // aliases plats pour les nouveaux écrans
  grayLight: '#F3F4F6',
  grayMid:   '#9CA3AF',

  success: '#10B981',
  danger:  '#EF4444',
  warning: '#F59E0B',
  text:       '#111827',
  textLight:  '#6B7280',
  textMuted:  '#9CA3AF',
};

// ── Tailles de texte ──────────────────────────────────────────
export const SIZES = {
  small:   12,
  medium:  14,
  large:   16,
  xLarge:  20,
  xxLarge: 28,
};

// ── Espacements ───────────────────────────────────────────────
export const SPACING = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
};

// ── Rayons de bordure ─────────────────────────────────────────
export const RADIUS = {
  sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, full: 999,
};

// ── Graisse de police ─────────────────────────────────────────
export const FONT = {
  regular:   '400',
  medium:    '500',
  semibold:  '600',
  bold:      '700',
  extrabold: '800',
  black:     '900',
};

// ── Ombres ────────────────────────────────────────────────────
export const SHADOW = {
  sm: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  md: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  lg: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12, shadowRadius: 20, elevation: 8,
  },
};

// Alias SHADOWS (avec S) pour compatibilité avec les écrans existants
export const SHADOWS = {
  small: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  medium: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  large: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12, shadowRadius: 20, elevation: 8,
  },
};
