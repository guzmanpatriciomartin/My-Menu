import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Palette, 
  Sun, 
  Moon, 
  Monitor, 
  Sparkles, 
  Check, 
  X, 
  Sliders, 
  Layers, 
  Eye, 
  RotateCcw,
  Sparkle,
  Square,
  Circle,
  Maximize2
} from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import { 
  THEME_TEMPLATES, 
  RADIUS_MAP, 
  BORDER_MAP, 
  BLUR_MAP, 
  BorderRadiusPreset, 
  BorderStylePreset, 
  BackdropBlurPreset,
  ThemeMode
} from '../theme/themeConfig';

interface ThemeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ThemeSelectorModal({ isOpen, onClose }: ThemeSelectorModalProps) {
  const { 
    templateId, 
    activeTemplate, 
    mode, 
    isDark, 
    radius, 
    borderStyle, 
    backdropBlur, 
    classes,
    setTemplate, 
    setMode, 
    setRadius, 
    setBorderStyle, 
    setBackdropBlur, 
    resetToPreset,
    toggleMode
  } = useTheme();

  const [activeTab, setActiveTab] = useState<'presets' | 'custom'>('presets');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto font-sans"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`w-full max-w-4xl max-h-[90vh] flex flex-col my-auto overflow-hidden shadow-2xl ${classes.bgCard} ${classes.radiusCard} ${classes.borderCard}`}
          >
          {/* Header */}
          <div className={`p-5 sm:p-6 flex items-center justify-between border-b ${classes.borderDivider} ${classes.bgHeader}`}>
            <div className="flex items-center space-x-3">
              <div className={`p-2.5 ${classes.radiusBtn} ${classes.badgeAccent} flex items-center justify-center`}>
                <Palette className="w-5 h-5" />
              </div>
              <div>
                <h2 className={`text-lg font-bold tracking-tight ${classes.textPrimary} flex items-center gap-2`}>
                  Plantillas & Estilos Visuales
                  <span className={`text-[10px] uppercase font-mono px-2 py-0.5 font-black ${classes.radiusPill} ${classes.badgeAccent}`}>
                    {activeTemplate.name}
                  </span>
                </h2>
                <p className={`text-xs ${classes.textMuted}`}>
                  Personaliza modos claro/oscuro, suavizados, bordes y efectos de fondo blur
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className={`p-2 rounded-full hover:opacity-80 transition cursor-pointer ${classes.secondaryBtn}`}
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-8">
            {/* Quick Controls: Mode & Tabs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              {/* Dark / Light / System Mode Switcher */}
              <div className="space-y-1.5">
                <label className={`text-xs font-bold font-mono uppercase tracking-wider ${classes.textMuted} flex items-center gap-1.5`}>
                  <Sun className="w-3.5 h-3.5" /> Modo de Visualización
                </label>
                <div className={`grid grid-cols-3 p-1 ${classes.radiusCard} ${classes.inputBg} border ${classes.borderCard}`}>
                  {[
                    { id: 'light', label: 'Claro', icon: Sun },
                    { id: 'dark', label: 'Oscuro', icon: Moon },
                    { id: 'system', label: 'Sistema', icon: Monitor }
                  ].map(item => {
                    const Icon = item.icon;
                    const isActive = mode === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setMode(item.id as ThemeMode)}
                        className={`flex items-center justify-center space-x-1.5 py-2 px-3 text-xs font-bold ${classes.radiusBtn} transition cursor-pointer ${
                          isActive
                            ? `${classes.primaryBtn}`
                            : `${classes.textMuted} hover:${classes.textPrimary}`
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* View Selector Tabs */}
              <div className="space-y-1.5">
                <label className={`text-xs font-bold font-mono uppercase tracking-wider ${classes.textMuted} flex items-center gap-1.5`}>
                  <Sliders className="w-3.5 h-3.5" /> Configuración
                </label>
                <div className={`grid grid-cols-2 p-1 ${classes.radiusCard} ${classes.inputBg} border ${classes.borderCard}`}>
                  <button
                    type="button"
                    onClick={() => setActiveTab('presets')}
                    className={`py-2 px-3 text-xs font-bold ${classes.radiusBtn} transition cursor-pointer flex items-center justify-center space-x-1.5 ${
                      activeTab === 'presets'
                        ? `${classes.primaryBtn}`
                        : `${classes.textMuted} hover:${classes.textPrimary}`
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Plantillas Preset</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('custom')}
                    className={`py-2 px-3 text-xs font-bold ${classes.radiusBtn} transition cursor-pointer flex items-center justify-center space-x-1.5 ${
                      activeTab === 'custom'
                        ? `${classes.primaryBtn}`
                        : `${classes.textMuted} hover:${classes.textPrimary}`
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Ajustes Finos</span>
                  </button>
                </div>
              </div>
            </div>

            {/* TAB 1: PRESET TEMPLATES */}
            {activeTab === 'presets' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className={`text-sm font-bold uppercase font-mono tracking-wider ${classes.textPrimary}`}>
                    Galaxia de Plantillas Temáticas
                  </h3>
                  <span className={`text-xs ${classes.textMuted}`}>
                    {THEME_TEMPLATES.length} estilos prediseñados
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {THEME_TEMPLATES.map((tmpl) => {
                    const isSelected = templateId === tmpl.id;
                    return (
                      <div
                        key={tmpl.id}
                        onClick={() => setTemplate(tmpl.id)}
                        className={`group relative p-4 cursor-pointer transition-all ${classes.radiusCard} border text-left overflow-hidden ${
                          isSelected
                            ? 'ring-2 ring-amber-500 border-amber-500 shadow-lg'
                            : `${classes.borderCard} ${classes.bgCardHover}`
                        }`}
                        style={{ backgroundColor: isSelected ? undefined : undefined }}
                      >
                        {/* Top Badge & Indicators */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-1.5">
                            <span 
                              className="w-3 h-3 rounded-full border border-white/20 shadow-sm"
                              style={{ backgroundColor: tmpl.previewAccent }}
                            />
                            <span 
                              className="w-3 h-3 rounded-full border border-white/20 shadow-sm"
                              style={{ backgroundColor: tmpl.previewBg }}
                            />
                            <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${tmpl.mode === 'dark' ? 'bg-zinc-800 text-zinc-300' : 'bg-stone-200 text-stone-800'}`}>
                              {tmpl.mode === 'dark' ? '🌙 Dark' : '☀️ Light'}
                            </span>
                          </div>

                          {isSelected && (
                            <span className="p-1 rounded-full bg-amber-500 text-zinc-950 font-bold">
                              <Check className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>

                        {/* Title & Tagline */}
                        <h4 className={`text-sm font-bold mb-1 ${classes.textPrimary}`}>
                          {tmpl.name}
                        </h4>
                        <p className={`text-xs line-clamp-2 mb-3 ${classes.textMuted}`}>
                          {tmpl.tagline}
                        </p>

                        {/* Visual Spec Badges */}
                        <div className="flex flex-wrap gap-1 mt-auto pt-2 border-t border-black/10 dark:border-white/10 text-[10px] font-mono">
                          <span className={`px-1.5 py-0.5 rounded ${classes.badgeMuted}`}>
                            Bordes: {RADIUS_MAP[tmpl.radius].label}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded ${classes.badgeMuted}`}>
                            Blur: {BLUR_MAP[tmpl.blur].label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: FINE CUSTOMIZATIONS (Bordes, Suavizados, Blur) */}
            {activeTab === 'custom' && (
              <div className="space-y-6">
                {/* 1. Suavizado de Bordes (Border Radius) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className={`text-xs font-bold font-mono uppercase tracking-wider ${classes.textPrimary} flex items-center gap-2`}>
                      <Circle className="w-4 h-4 text-amber-500" /> Suavizado de Bordes (Corner Radius)
                    </label>
                    <span className={`text-xs font-mono font-bold ${classes.textAccent}`}>
                      Actual: {RADIUS_MAP[radius].name}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(['sharp', 'soft', 'curved', 'ultra'] as BorderRadiusPreset[]).map((r) => {
                      const item = RADIUS_MAP[r];
                      const isSelected = radius === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setRadius(r)}
                          className={`p-3 text-left transition cursor-pointer border ${item.card} ${
                            isSelected
                              ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500'
                              : `${classes.borderCard} ${classes.inputBg} hover:border-zinc-500`
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`text-xs font-bold ${isSelected ? classes.textAccent : classes.textPrimary}`}>
                              {item.name}
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-amber-500" />}
                          </div>
                          <p className={`text-[10px] font-mono ${classes.textMuted}`}>
                            Radio: {item.label}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Estilo de Bordes */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className={`text-xs font-bold font-mono uppercase tracking-wider ${classes.textPrimary} flex items-center gap-2`}>
                      <Square className="w-4 h-4 text-amber-500" /> Estilo & Trazo de Bordes
                    </label>
                    <span className={`text-xs font-mono font-bold ${classes.textAccent}`}>
                      Actual: {BORDER_MAP[borderStyle].name}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(['subtle', 'glass', 'bold', 'glow'] as BorderStylePreset[]).map((b) => {
                      const item = BORDER_MAP[b];
                      const isSelected = borderStyle === b;
                      return (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setBorderStyle(b)}
                          className={`p-3 text-left transition cursor-pointer ${classes.radiusCard} ${item.class} ${
                            isSelected
                              ? 'bg-amber-500/10 border-amber-500 ring-1 ring-amber-500'
                              : `${classes.inputBg} hover:border-zinc-400`
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs font-bold ${isSelected ? classes.textAccent : classes.textPrimary}`}>
                              {item.name}
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-amber-500" />}
                          </div>
                          <p className={`text-[10px] font-mono ${classes.textMuted}`}>
                            {item.label}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Fondo Blur & Vidrio Esmerilado */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className={`text-xs font-bold font-mono uppercase tracking-wider ${classes.textPrimary} flex items-center gap-2`}>
                      <Layers className="w-4 h-4 text-amber-500" /> Efecto de Fondo Blur (Glassmorphism)
                    </label>
                    <span className={`text-xs font-mono font-bold ${classes.textAccent}`}>
                      Actual: {BLUR_MAP[backdropBlur].name}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {(['none', 'subtle', 'glass', 'deep'] as BackdropBlurPreset[]).map((bl) => {
                      const item = BLUR_MAP[bl];
                      const isSelected = backdropBlur === bl;
                      return (
                        <button
                          key={bl}
                          type="button"
                          onClick={() => setBackdropBlur(bl)}
                          className={`p-3 text-left transition cursor-pointer ${classes.radiusCard} ${item.class} border ${
                            isSelected
                              ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500'
                              : `${classes.borderCard} ${classes.inputBg} hover:border-zinc-400`
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs font-bold ${isSelected ? classes.textAccent : classes.textPrimary}`}>
                              {item.name}
                            </span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-amber-500" />}
                          </div>
                          <p className={`text-[10px] font-mono ${classes.textMuted}`}>
                            {item.label}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* LIVE PREVIEW COMPONENT */}
            <div className="space-y-3 pt-4 border-t border-black/10 dark:border-white/10">
              <div className="flex items-center justify-between">
                <h4 className={`text-xs font-bold font-mono uppercase tracking-wider ${classes.textMuted} flex items-center gap-2`}>
                  <Eye className="w-4 h-4 text-amber-500" /> Vista Previa en Tiempo Real
                </h4>
                <button
                  type="button"
                  onClick={() => resetToPreset()}
                  className={`text-xs flex items-center gap-1 font-mono hover:underline cursor-pointer ${classes.textAccent}`}
                >
                  <RotateCcw className="w-3 h-3" /> Restablecer a Valores del Preset
                </button>
              </div>

              {/* Sample Card Rendered with Active Theme Classes */}
              <div className={`relative p-5 overflow-hidden transition-all duration-300 ${classes.bgApp} ${classes.radiusCard} border ${classes.borderCard} ${classes.blurClass}`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    <div className={`w-14 h-14 ${classes.radiusCard} bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold text-xl shadow-md`}>
                      ☕
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-xs uppercase font-mono font-bold px-2 py-0.5 ${classes.radiusPill} ${classes.badgeAccent}`}>
                          Recomendado
                        </span>
                        <span className={`text-xs font-mono ${classes.textMuted}`}>#001</span>
                      </div>
                      <h5 className={`text-base font-bold mt-1 ${classes.textPrimary}`}>
                        Flat White Especial Speakeasy
                      </h5>
                      <p className={`text-xs ${classes.textSecondary}`}>
                        Doble shot de espresso con leche cremada suave y notas de avellana
                      </p>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2">
                    <span className={`text-lg font-black font-mono ${classes.textAccent}`}>
                      $ 3.800
                    </span>
                    <button
                      type="button"
                      className={`px-4 py-2 text-xs font-bold ${classes.radiusBtn} ${classes.primaryBtn} flex items-center space-x-1.5 cursor-pointer`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Agregar</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Bar */}
          <div className={`p-4 sm:p-5 border-t ${classes.borderDivider} ${classes.bgHeader} flex items-center justify-between`}>
            <div className="text-xs font-mono">
              <span className={classes.textMuted}>Tema Activo: </span>
              <span className={`font-bold ${classes.textPrimary}`}>{activeTemplate.name}</span>
              <span className={`ml-2 text-[10px] ${classes.textMuted}`}>
                ({isDark ? 'Modo Oscuro' : 'Modo Claro'}, Radio {RADIUS_MAP[radius].label})
              </span>
            </div>

            <button
              onClick={onClose}
              className={`px-6 py-2.5 text-xs font-bold ${classes.radiusBtn} ${classes.primaryBtn} cursor-pointer`}
            >
              Aplicar y Cerrar
            </button>
          </div>
        </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
