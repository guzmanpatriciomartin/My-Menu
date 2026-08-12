export type ThemeMode = 'dark' | 'light' | 'system';
export type BorderRadiusPreset = 'sharp' | 'soft' | 'curved' | 'ultra';
export type BorderStylePreset = 'subtle' | 'glass' | 'bold' | 'glow';
export type BackdropBlurPreset = 'none' | 'subtle' | 'glass' | 'deep';

export interface ThemeTemplate {
  id: string;
  name: string;
  tagline: string;
  mode: 'dark' | 'light';
  previewBg: string;
  previewAccent: string;
  previewCardBg: string;
  radius: BorderRadiusPreset;
  borderStyle: BorderStylePreset;
  blur: BackdropBlurPreset;
  classes: {
    bgApp: string;
    bgHeader: string;
    bgCard: string;
    bgCardHover: string;
    bgDrawer: string;
    borderCard: string;
    borderDivider: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    textAccent: string;
    primaryBtn: string;
    secondaryBtn: string;
    badgeAccent: string;
    badgeMuted: string;
    inputBg: string;
    inputBorder: string;
    glassOverlay: string;
  };
}

export const RADIUS_MAP: Record<BorderRadiusPreset, { name: string; card: string; button: string; pill: string; label: string }> = {
  sharp: { name: 'Recto (Sharp)', card: 'rounded-none', button: 'rounded-none', pill: 'rounded-none', label: '0px' },
  soft: { name: 'Suave (Soft)', card: 'rounded-lg', button: 'rounded-md', pill: 'rounded-full', label: '8px' },
  curved: { name: 'Curvo (Curved)', card: 'rounded-2xl', button: 'rounded-xl', pill: 'rounded-full', label: '16px' },
  ultra: { name: 'Ultra Suave (Pill)', card: 'rounded-3xl', button: 'rounded-2xl', pill: 'rounded-full', label: '24px' }
};

export const BORDER_MAP: Record<BorderStylePreset, { name: string; class: string; label: string }> = {
  subtle: { name: 'Sutil (Hairline)', class: 'border border-opacity-30', label: '1px Fino' },
  glass: { name: 'Vidrio (Glass)', class: 'border border-white/15 dark:border-white/10', label: 'Translúcido' },
  bold: { name: 'Contorno Marcado', class: 'border-2', label: '2px Fuerte' },
  glow: { name: 'Resplandor (Glow)', class: 'border border-amber-500/40 shadow-lg shadow-amber-500/10', label: 'Efecto Neon' }
};

export const BLUR_MAP: Record<BackdropBlurPreset, { name: string; class: string; label: string }> = {
  none: { name: 'Sin Blur (Opaco)', class: 'backdrop-blur-none', label: '0px' },
  subtle: { name: 'Vidrio Sutil', class: 'backdrop-blur-sm bg-opacity-90', label: 'Blur 4px' },
  glass: { name: 'Vidrio Esmerilado', class: 'backdrop-blur-md bg-opacity-75', label: 'Blur 12px' },
  deep: { name: 'Ultra Frosted', class: 'backdrop-blur-xl bg-opacity-60', label: 'Blur 24px' }
};

export const THEME_TEMPLATES: ThemeTemplate[] = [
  {
    id: 'speakeasy-dark',
    name: 'Speakeasy Noche',
    tagline: 'Elegancia oscura estilo bar de coctelería con detalles dorados',
    mode: 'dark',
    previewBg: '#09090b',
    previewAccent: '#f59e0b',
    previewCardBg: '#18181b',
    radius: 'sharp',
    borderStyle: 'glass',
    blur: 'glass',
    classes: {
      bgApp: 'bg-zinc-950 text-zinc-100',
      bgHeader: 'bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/80',
      bgCard: 'bg-zinc-900/90 border border-zinc-800/80 shadow-xl shadow-black/40',
      bgCardHover: 'hover:border-amber-500/50 hover:bg-zinc-900 transition-all',
      bgDrawer: 'bg-zinc-950/95 border-l border-zinc-800 backdrop-blur-2xl text-zinc-100',
      borderCard: 'border-zinc-800/80',
      borderDivider: 'border-zinc-800/60',
      textPrimary: 'text-zinc-50',
      textSecondary: 'text-zinc-300',
      textMuted: 'text-zinc-500',
      textAccent: 'text-amber-400',
      primaryBtn: 'bg-amber-500 text-zinc-950 hover:bg-amber-400 font-bold shadow-lg shadow-amber-500/20 active:scale-98',
      secondaryBtn: 'bg-zinc-800/90 text-zinc-200 hover:bg-zinc-700 hover:text-white border border-zinc-700/80',
      badgeAccent: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
      badgeMuted: 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/60',
      inputBg: 'bg-zinc-900 text-zinc-100 placeholder-zinc-500',
      inputBorder: 'border-zinc-800 focus:border-amber-500',
      glassOverlay: 'bg-zinc-950/70 backdrop-blur-md'
    }
  },
  {
    id: 'bistro-light',
    name: 'Bistro Cálido',
    tagline: 'Modo claro acogedor para cafeterías, panaderías y bistrós',
    mode: 'light',
    previewBg: '#fafaf9',
    previewAccent: '#d97706',
    previewCardBg: '#ffffff',
    radius: 'curved',
    borderStyle: 'subtle',
    blur: 'subtle',
    classes: {
      bgApp: 'bg-stone-100 text-stone-900',
      bgHeader: 'bg-white/85 backdrop-blur-md border-b border-stone-200/90 shadow-sm',
      bgCard: 'bg-white border border-stone-200/80 shadow-md shadow-stone-200/50',
      bgCardHover: 'hover:border-amber-400 hover:shadow-lg transition-all',
      bgDrawer: 'bg-stone-50/98 border-l border-stone-200 backdrop-blur-xl text-stone-900',
      borderCard: 'border-stone-200/80',
      borderDivider: 'border-stone-200',
      textPrimary: 'text-stone-900',
      textSecondary: 'text-stone-700',
      textMuted: 'text-stone-400',
      textAccent: 'text-amber-700',
      primaryBtn: 'bg-amber-600 text-white hover:bg-amber-700 font-bold shadow-md shadow-amber-600/20 active:scale-98',
      secondaryBtn: 'bg-stone-200/80 text-stone-800 hover:bg-stone-300 border border-stone-300/80',
      badgeAccent: 'bg-amber-100 text-amber-800 border border-amber-300',
      badgeMuted: 'bg-stone-200 text-stone-600 border border-stone-300',
      inputBg: 'bg-white text-stone-900 placeholder-stone-400',
      inputBorder: 'border-stone-300 focus:border-amber-600',
      glassOverlay: 'bg-stone-900/40 backdrop-blur-sm'
    }
  },
  {
    id: 'cyber-neon',
    name: 'Cyber Neon',
    tagline: 'Fondo violeta oscuro con neón cian, bordes brillantes y vidrio traslúcido',
    mode: 'dark',
    previewBg: '#0f0728',
    previewAccent: '#06b6d4',
    previewCardBg: '#1e1145',
    radius: 'curved',
    borderStyle: 'glow',
    blur: 'deep',
    classes: {
      bgApp: 'bg-slate-950 text-slate-100',
      bgHeader: 'bg-slate-950/70 backdrop-blur-2xl border-b border-cyan-500/30 shadow-lg shadow-cyan-950/30',
      bgCard: 'bg-slate-900/60 backdrop-blur-xl border border-cyan-500/20 shadow-xl shadow-cyan-500/5',
      bgCardHover: 'hover:border-cyan-400 hover:shadow-cyan-500/20 hover:bg-slate-900/80 transition-all',
      bgDrawer: 'bg-slate-950/90 border-l border-cyan-500/30 backdrop-blur-2xl text-slate-100',
      borderCard: 'border-cyan-500/20',
      borderDivider: 'border-slate-800',
      textPrimary: 'text-slate-50',
      textSecondary: 'text-cyan-100',
      textMuted: 'text-slate-400',
      textAccent: 'text-cyan-400',
      primaryBtn: 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold hover:brightness-110 shadow-lg shadow-cyan-500/25 active:scale-98',
      secondaryBtn: 'bg-slate-800/80 text-cyan-300 hover:bg-slate-700 hover:text-white border border-cyan-500/30',
      badgeAccent: 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm shadow-cyan-500/30',
      badgeMuted: 'bg-slate-800 text-slate-400 border border-slate-700',
      inputBg: 'bg-slate-900/80 text-slate-100 placeholder-slate-500',
      inputBorder: 'border-cyan-500/40 focus:border-cyan-400',
      glassOverlay: 'bg-slate-950/80 backdrop-blur-xl'
    }
  },
  {
    id: 'emerald-gourmet',
    name: 'Gourmet Esmeralda',
    tagline: 'Estilo distinguido de alta cocina con tonos verde esmeralda y champán',
    mode: 'dark',
    previewBg: '#022c22',
    previewAccent: '#fde047',
    previewCardBg: '#064e3b',
    radius: 'ultra',
    borderStyle: 'glass',
    blur: 'glass',
    classes: {
      bgApp: 'bg-emerald-950 text-emerald-50',
      bgHeader: 'bg-emerald-950/85 backdrop-blur-xl border-b border-emerald-800/60 shadow-lg',
      bgCard: 'bg-emerald-900/40 backdrop-blur-md border border-emerald-700/50 shadow-xl shadow-emerald-950/50',
      bgCardHover: 'hover:border-emerald-400/70 hover:bg-emerald-900/60 transition-all',
      bgDrawer: 'bg-emerald-950/95 border-l border-emerald-800 backdrop-blur-2xl text-emerald-50',
      borderCard: 'border-emerald-700/50',
      borderDivider: 'border-emerald-800/60',
      textPrimary: 'text-emerald-50',
      textSecondary: 'text-emerald-200',
      textMuted: 'text-emerald-400/70',
      textAccent: 'text-amber-300',
      primaryBtn: 'bg-amber-400 text-emerald-950 hover:bg-amber-300 font-bold shadow-lg shadow-amber-400/20 active:scale-98',
      secondaryBtn: 'bg-emerald-900/80 text-emerald-100 hover:bg-emerald-800 border border-emerald-700/60',
      badgeAccent: 'bg-amber-400/20 text-amber-300 border border-amber-400/40',
      badgeMuted: 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/40',
      inputBg: 'bg-emerald-900/60 text-emerald-100 placeholder-emerald-400/60',
      inputBorder: 'border-emerald-700 focus:border-amber-400',
      glassOverlay: 'bg-emerald-950/80 backdrop-blur-md'
    }
  },
  {
    id: 'minimal-slate',
    name: 'Minimalista Blanco & Negro',
    tagline: 'Diseño limpio de contraste puro con tipografía ultra legible y bordes nítidos',
    mode: 'light',
    previewBg: '#f8fafc',
    previewAccent: '#0f172a',
    previewCardBg: '#ffffff',
    radius: 'soft',
    borderStyle: 'bold',
    blur: 'subtle',
    classes: {
      bgApp: 'bg-slate-50 text-slate-900',
      bgHeader: 'bg-white/90 backdrop-blur-md border-b-2 border-slate-900 shadow-sm',
      bgCard: 'bg-white border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]',
      bgCardHover: 'hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] transition-all',
      bgDrawer: 'bg-white border-l-2 border-slate-900 text-slate-900',
      borderCard: 'border-2 border-slate-900',
      borderDivider: 'border-slate-900',
      textPrimary: 'text-slate-900',
      textSecondary: 'text-slate-700',
      textMuted: 'text-slate-500',
      textAccent: 'text-slate-900',
      primaryBtn: 'bg-slate-900 text-white font-black hover:bg-slate-800 border-2 border-slate-900 active:translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]',
      secondaryBtn: 'bg-white text-slate-900 font-bold hover:bg-slate-100 border-2 border-slate-900',
      badgeAccent: 'bg-slate-900 text-white font-bold border-2 border-slate-900',
      badgeMuted: 'bg-slate-100 text-slate-800 border border-slate-300',
      inputBg: 'bg-white text-slate-900 placeholder-slate-400',
      inputBorder: 'border-2 border-slate-900 focus:bg-slate-50',
      glassOverlay: 'bg-slate-900/60 backdrop-blur-sm'
    }
  },
  {
    id: 'sunset-bakery',
    name: 'Atardecer Melocotón',
    tagline: 'Modo claro con tonos cálidos de terracota, durazno y bordes redondeados',
    mode: 'light',
    previewBg: '#fff7ed',
    previewAccent: '#ea580c',
    previewCardBg: '#ffffff',
    radius: 'curved',
    borderStyle: 'glass',
    blur: 'glass',
    classes: {
      bgApp: 'bg-orange-50/60 text-zinc-900',
      bgHeader: 'bg-white/80 backdrop-blur-xl border-b border-orange-200/80 shadow-sm',
      bgCard: 'bg-white/90 backdrop-blur-md border border-orange-200/80 shadow-lg shadow-orange-500/5',
      bgCardHover: 'hover:border-orange-400 hover:shadow-orange-500/15 transition-all',
      bgDrawer: 'bg-orange-50/95 border-l border-orange-200 backdrop-blur-2xl text-zinc-900',
      borderCard: 'border-orange-200/80',
      borderDivider: 'border-orange-200',
      textPrimary: 'text-zinc-900',
      textSecondary: 'text-zinc-700',
      textMuted: 'text-zinc-400',
      textAccent: 'text-orange-600',
      primaryBtn: 'bg-orange-600 text-white font-bold hover:bg-orange-500 shadow-md shadow-orange-600/20 active:scale-98',
      secondaryBtn: 'bg-orange-100 text-orange-900 hover:bg-orange-200 border border-orange-200',
      badgeAccent: 'bg-orange-100 text-orange-800 border border-orange-300',
      badgeMuted: 'bg-zinc-100 text-zinc-600 border border-zinc-200',
      inputBg: 'bg-white text-zinc-900 placeholder-zinc-400',
      inputBorder: 'border-orange-200 focus:border-orange-500',
      glassOverlay: 'bg-zinc-900/50 backdrop-blur-md'
    }
  }
];
