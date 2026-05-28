// ── Shifter Rider — Dark Theme ────────────────────────────────
export const COLORS = {
  // Backgrounds
  bg:        '#0F0F1A',
  bgCard:    '#1A1A2E',
  bgInput:   '#16213E',
  bgElevated:'#1E1E35',

  // Brand
  primary:   '#2ECC71',   // bolt-green
  primaryDark:'#27AE60',
  accent:    '#F39C12',   // earnings amber
  danger:    '#E74C3C',
  warning:   '#F39C12',

  // Text
  text:      '#FFFFFF',
  textSub:   '#A0A8C0',
  textMuted: '#555E7A',

  // Borders
  border:    '#252545',
  borderLight:'#2E2E50',

  // Status
  online:    '#2ECC71',
  offline:   '#E74C3C',
  pending:   '#F39C12',

  white:     '#FFFFFF',
  black:     '#000000',
};

export const FONT = {
  regular:   '400',
  medium:    '500',
  semibold:  '600',
  bold:      '700',
  extrabold: '800',
  black:     '900',
};

export const SPACING = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
};

export const RADIUS = {
  sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, full: 999,
};

export const SHADOW = {
  green: {
    shadowColor: '#2ECC71',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
};
