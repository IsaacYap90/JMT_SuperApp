export const Colors = {
  // Primary brand colors
  jaiBlue: '#0096FF',
  jaiBlueLight: '#4DA6FF',
  jaiBlueDark: '#0066CC',
  jaiBlueAccent: '#00D4FF',

  // Background colors
  black: '#0A0A0F',
  darkCharcoal: '#121218',
  charcoal: '#1A1A24',
  cardBg: '#1E1E2A',
  surface: '#242432',

  // Neon accent colors
  neonBlue: '#00D4FF',
  neonPurple: '#B366FF',
  neonPink: '#FF66B8',
  neonGreen: '#00FF88',
  cyan: '#00E5FF',
  magenta: '#FF00FF',
  yellow: '#FFD700',

  // Status colors
  success: '#00E676',
  successLight: '#69F0AE',
  successDark: '#00C853',
  warning: '#FFAB00',
  warningLight: '#FFD180',
  warningDark: '#FF8F00',
  error: '#FF1744',
  errorLight: '#FF616F',
  errorDark: '#D50000',
  info: '#00B0FF',

  // Text colors
  white: '#FFFFFF',
  lightGray: '#B3B3CC',
  mediumGray: '#808099',
  darkGray: '#4D4D66',
  placeholder: '#3D3D4D',

  // Border and divider colors
  border: '#2C2C3D',
  borderLight: '#3D3D4D',
  borderDark: '#1C1C2D',
  divider: 'rgba(255,255,255,0.08)',
  dividerLight: 'rgba(255,255,255,0.15)',

  // Glass effect colors
  glassBg: 'rgba(30, 30, 42, 0.7)',
  glassBgLight: 'rgba(30, 30, 42, 0.4)',
  glassStroke: 'rgba(255, 255, 255, 0.1)',
  glassHighlight: 'rgba(255, 255, 255, 0.05)',
  glassShadow: 'rgba(0, 0, 0, 0.3)',

  // Overlay colors
  overlayDark: 'rgba(0, 0, 0, 0.8)',
  overlayLight: 'rgba(0, 0, 0, 0.4)',
  scrim: 'rgba(10, 10, 15, 0.95)',

  // Gradient start/end colors
  gradientStart: '#0A0A0F',
  gradientEnd: '#0A1520',
  gradientPrimary: ['#0096FF', '#B366FF'],
  gradientNeon: ['#00D4FF', '#00FF88'],
  gradientSunset: ['#FF66B8', '#FF8F00'],
};

export const Fonts = {
  heading: 'Montserrat_700Bold_Italic',
  regular: 'Montserrat_400Regular',
  medium: 'Montserrat_500Medium',
  semiBold: 'Montserrat_600SemiBold',
  bold: 'Montserrat_700Bold',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const Shadows = {
  // Standard shadow
  standard: {
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },

  // Card shadow
  card: {
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },

  // Glow effect (for neon elements)
  glow: {
    shadowColor: Colors.jaiBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },

  // Purple glow
  glowPurple: {
    shadowColor: Colors.neonPurple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },

  // Green glow
  glowGreen: {
    shadowColor: Colors.neonGreen,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },

  // Inner shadow (for pressed states)
  inner: {
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 2,
  },

  // Text shadow for headings
  text: {
    shadowColor: Colors.jaiBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
};
