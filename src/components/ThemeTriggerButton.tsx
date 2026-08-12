import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';
import ThemeSelectorModal from './ThemeSelectorModal';

interface ThemeTriggerButtonProps {
  className?: string;
  variant?: 'floating' | 'inline';
}

export default function ThemeTriggerButton({ className = '', variant = 'floating' }: ThemeTriggerButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { classes } = useTheme();

  if (variant === 'inline') {
    return (
      <>
        <button
          type="button"
          id="btn-open-theme-selector-inline"
          onClick={() => setIsModalOpen(true)}
          className={`flex items-center space-x-2 px-3 py-2 text-xs font-mono font-bold bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white transition cursor-pointer rounded-none ${className}`}
          title="Editar estilo del sitio"
        >
          <Settings className="w-4 h-4 text-amber-500" />
          <span>Editar estilo</span>
        </button>

        <ThemeSelectorModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div className={`fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-[9000] ${className}`}>
        <button
          type="button"
          id="btn-open-theme-selector-floating"
          onClick={() => setIsModalOpen(true)}
          className={`group flex items-center space-x-2 px-3.5 py-2.5 shadow-2xl transition-all duration-300 bg-zinc-900 border border-zinc-700 hover:border-amber-500 text-white rounded-none hover:scale-105 active:scale-95 cursor-pointer`}
          title="Editar estilo del sitio"
        >
          <Settings className="w-4 h-4 text-amber-500" />
          <span className="font-bold text-xs uppercase tracking-wider font-mono">
            Editar estilo
          </span>
        </button>
      </div>

      <ThemeSelectorModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
