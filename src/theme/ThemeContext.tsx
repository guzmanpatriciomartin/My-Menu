import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { 
  ThemeTemplate, 
  ThemeMode, 
  BorderRadiusPreset, 
  BorderStylePreset, 
  BackdropBlurPreset, 
  PrimaryColorPreset,
  PrimaryColorConfig,
  THEME_TEMPLATES, 
  PRIMARY_COLORS_MAP,
  RADIUS_MAP, 
  BORDER_MAP, 
  BLUR_MAP 
} from './themeConfig';

interface ThemeConfigState {
  templateId: string;
  mode: ThemeMode;
  primaryColorOverride: PrimaryColorPreset | null;
  radiusOverride: BorderRadiusPreset | null;
  borderStyleOverride: BorderStylePreset | null;
  blurOverride: BackdropBlurPreset | null;
}

const STORAGE_KEY = 'mimenus_theme_template_v1';

const DEFAULT_STATE: ThemeConfigState = {
  templateId: 'speakeasy-dark',
  mode: 'system',
  primaryColorOverride: null,
  radiusOverride: null,
  borderStyleOverride: null,
  blurOverride: null
};

interface ThemeContextType {
  templateId: string;
  activeTemplate: ThemeTemplate;
  mode: ThemeMode;
  isDark: boolean;
  primaryColor: PrimaryColorPreset;
  primaryColorConfig: PrimaryColorConfig;
  radius: BorderRadiusPreset;
  borderStyle: BorderStylePreset;
  backdropBlur: BackdropBlurPreset;
  classes: ThemeTemplate['classes'] & {
    radiusCard: string;
    radiusBtn: string;
    radiusPill: string;
    borderClass: string;
    blurClass: string;
  };
  setTemplate: (id: string) => void;
  setMode: (mode: ThemeMode) => void;
  setPrimaryColor: (color: PrimaryColorPreset | null) => void;
  setRadius: (radius: BorderRadiusPreset | null) => void;
  setBorderStyle: (borderStyle: BorderStylePreset | null) => void;
  setBackdropBlur: (blur: BackdropBlurPreset | null) => void;
  resetToPreset: (id?: string) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<ThemeConfigState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_STATE, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load theme config', e);
    }
    return DEFAULT_STATE;
  });

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn('Failed to save theme config', e);
    }
  }, [config]);

  // Active base template
  const activeTemplate = useMemo(() => {
    return THEME_TEMPLATES.find(t => t.id === config.templateId) || THEME_TEMPLATES[0];
  }, [config.templateId]);

  // Primary Color config
  const primaryColor: PrimaryColorPreset = config.primaryColorOverride || activeTemplate.primaryColor || 'amber';
  const primaryColorConfig = useMemo(() => {
    return PRIMARY_COLORS_MAP[primaryColor] || PRIMARY_COLORS_MAP.amber;
  }, [primaryColor]);

  // System Dark Mode detection
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return true;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Determine Effective Dark vs Light Mode
  const isDark = useMemo(() => {
    if (config.mode === 'dark') return true;
    if (config.mode === 'light') return false;
    // 'system' mode defaults to template's base mode or system preference
    if (config.mode === 'system') return systemPrefersDark;
    return activeTemplate.mode === 'dark';
  }, [config.mode, activeTemplate.mode, systemPrefersDark]);

  // Sync HTML document class & Primary Color CSS Variable
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
    root.style.setProperty('--primary-color', primaryColorConfig.hex);
  }, [isDark, primaryColorConfig]);

  // Effective Radius, Border, and Blur
  const radius = config.radiusOverride || activeTemplate.radius;
  const borderStyle = config.borderStyleOverride || activeTemplate.borderStyle;
  const backdropBlur = config.blurOverride || activeTemplate.blur;

  // Compute aggregated CSS classes
  const classes = useMemo(() => {
    const radiusConfig = RADIUS_MAP[radius];
    const borderConfig = BORDER_MAP[borderStyle];
    const blurConfig = BLUR_MAP[backdropBlur];

    // Modify base template classes if mode differs from base template mode
    let baseClasses = { ...activeTemplate.classes };

    if (!isDark && activeTemplate.mode === 'dark') {
      // Light mode override for dark base templates
      baseClasses = {
        ...baseClasses,
        bgApp: 'bg-zinc-100 text-zinc-900',
        bgHeader: 'bg-white/90 backdrop-blur-xl border-b border-zinc-200/90 shadow-sm',
        bgCard: 'bg-white border border-zinc-200 shadow-md shadow-zinc-200/50',
        bgCardHover: 'hover:border-zinc-400 hover:shadow-lg transition-all',
        bgDrawer: 'bg-zinc-50/98 border-l border-zinc-200 backdrop-blur-2xl text-zinc-900',
        borderCard: 'border-zinc-200',
        borderDivider: 'border-zinc-200',
        textPrimary: 'text-zinc-900',
        textSecondary: 'text-zinc-700',
        textMuted: 'text-zinc-400',
        inputBg: 'bg-white text-zinc-900 placeholder-zinc-400',
        inputBorder: 'border-zinc-300 focus:border-zinc-900',
        glassOverlay: 'bg-zinc-900/40 backdrop-blur-sm'
      };
    } else if (isDark && activeTemplate.mode === 'light') {
      // Dark mode override for light base templates
      baseClasses = {
        ...baseClasses,
        bgApp: 'bg-zinc-950 text-zinc-100',
        bgHeader: 'bg-zinc-900/90 backdrop-blur-xl border-b border-zinc-800 shadow-md',
        bgCard: 'bg-zinc-900 border border-zinc-800 shadow-xl shadow-black/50',
        bgCardHover: 'hover:border-zinc-700 hover:bg-zinc-850 transition-all',
        bgDrawer: 'bg-zinc-950/98 border-l border-zinc-800 backdrop-blur-2xl text-zinc-100',
        borderCard: 'border-zinc-800',
        borderDivider: 'border-zinc-800',
        textPrimary: 'text-zinc-100',
        textSecondary: 'text-zinc-300',
        textMuted: 'text-zinc-500',
        inputBg: 'bg-zinc-900 text-zinc-100 placeholder-zinc-500',
        inputBorder: 'border-zinc-700 focus:border-amber-500',
        glassOverlay: 'bg-zinc-950/80 backdrop-blur-md'
      };
    }

    // Apply dynamic Primary Color overrides
    baseClasses = {
      ...baseClasses,
      textAccent: primaryColorConfig.textAccent,
      primaryBtn: primaryColorConfig.primaryBtn,
      badgeAccent: primaryColorConfig.badgeAccent,
      inputBorder: `${baseClasses.inputBorder.split(' ')[0]} ${primaryColorConfig.inputBorder}`
    };

    return {
      ...baseClasses,
      radiusCard: radiusConfig.card,
      radiusBtn: radiusConfig.button,
      radiusPill: radiusConfig.pill,
      borderClass: borderConfig.class,
      blurClass: blurConfig.class
    };
  }, [activeTemplate, isDark, radius, borderStyle, backdropBlur, primaryColorConfig]);

  const setTemplate = (id: string) => {
    const found = THEME_TEMPLATES.find(t => t.id === id);
    if (!found) return;
    setConfig(prev => ({
      ...prev,
      templateId: id,
      primaryColorOverride: null,
      // Default to template's native mode on change if system is not forced
      mode: prev.mode === 'system' ? 'system' : found.mode
    }));
  };

  const setMode = (mode: ThemeMode) => {
    setConfig(prev => ({ ...prev, mode }));
  };

  const setPrimaryColor = (primaryColorOverride: PrimaryColorPreset | null) => {
    setConfig(prev => ({ ...prev, primaryColorOverride }));
  };

  const setRadius = (radiusOverride: BorderRadiusPreset | null) => {
    setConfig(prev => ({ ...prev, radiusOverride }));
  };

  const setBorderStyle = (borderStyleOverride: BorderStylePreset | null) => {
    setConfig(prev => ({ ...prev, borderStyleOverride }));
  };

  const setBackdropBlur = (blurOverride: BackdropBlurPreset | null) => {
    setConfig(prev => ({ ...prev, blurOverride }));
  };

  const resetToPreset = (targetId?: string) => {
    const idToUse = targetId || config.templateId;
    const target = THEME_TEMPLATES.find(t => t.id === idToUse) || THEME_TEMPLATES[0];
    setConfig({
      templateId: target.id,
      mode: target.mode,
      primaryColorOverride: null,
      radiusOverride: null,
      borderStyleOverride: null,
      blurOverride: null
    });
  };

  const toggleMode = () => {
    setMode(isDark ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider
      value={{
        templateId: config.templateId,
        activeTemplate,
        mode: config.mode,
        isDark,
        primaryColor,
        primaryColorConfig,
        radius,
        borderStyle,
        backdropBlur,
        classes,
        setTemplate,
        setMode,
        setPrimaryColor,
        setRadius,
        setBorderStyle,
        setBackdropBlur,
        resetToPreset,
        toggleMode
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
};
