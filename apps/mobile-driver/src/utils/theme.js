// Même thème que l'app client - couleurs identiques pour la cohérence de marque
export const COLORS = {
  primary: '#FF6B35',
  primaryDark: '#E55B25',
  secondary: '#0F1729',
  secondaryLight: '#1A2744',
  accent: '#FFD700',
  success: '#00C48C',
  error: '#FF4757',
  warning: '#FFA502',
  white: '#FFFFFF',
  black: '#000000',
  gray: { 50:'#F8F9FA',100:'#F1F3F5',200:'#E9ECEF',300:'#DEE2E6',400:'#CED4DA',500:'#ADB5BD',600:'#6C757D',700:'#495057',800:'#343A40',900:'#212529' },
  background: '#F5F7FA',
};
export const SPACING = { xs:4,sm:8,md:16,lg:24,xl:32,xxl:48 };
export const SIZES = { xSmall:10,small:12,medium:14,large:16,xLarge:18,xxLarge:24,xxxLarge:32 };
export const RADIUS = { sm:8,md:12,lg:16,xl:24,full:9999 };
export const SHADOWS = {
  small: { shadowColor:'#000',shadowOffset:{width:0,height:2},shadowOpacity:0.1,shadowRadius:4,elevation:2 },
  medium: { shadowColor:'#000',shadowOffset:{width:0,height:4},shadowOpacity:0.12,shadowRadius:8,elevation:4 },
  large: { shadowColor:'#000',shadowOffset:{width:0,height:8},shadowOpacity:0.15,shadowRadius:16,elevation:8 },
};
