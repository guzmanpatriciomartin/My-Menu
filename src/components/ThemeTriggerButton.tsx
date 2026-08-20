import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { EstablishmentTheme } from '../types';
import { useTheme } from '../theme/ThemeContext';
import ThemeSelectorModal from './ThemeSelectorModal';

interface ThemeTriggerButtonProps {
  className?: string;
  variant?: 'floating' | 'inline';
  // Forwarded straight to the modal: the trigger has no opinion on who may persist.
  onPersist?: (theme: EstablishmentTheme) => Promise<boolean>;
}

export default function ThemeTriggerButton({ className = '', variant = 'floating', onPersist }: ThemeTriggerButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { classes } = useTheme();

  if (variant === 'inline') {
    return (
      <>
        <button
          type="button"
          id="btn-open-theme-selector-inline"
          onClick={() => setIsModalOpen(true)}
          className={`flex items-center space-x-2 px-3.5 py-2 text-xs font-mono font-bold ${classes.radiusBtn} ${classes.primaryBtn} transition-all cursor-pointer shadow-md ${className}`}
          title="Editar estilo del sitio"
        >
          <Settings className="w-4 h-4" />
          <span>Editar estilo</span>
        </button>

        <ThemeSelectorModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onPersist={onPersist} />
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
          className={`group flex items-center space-x-2 px-3.5 py-2.5 shadow-2xl transition-all duration-300 ${classes.radiusBtn} ${classes.primaryBtn} hover:scale-105 active:scale-95 cursor-pointer`}
          title="Editar estilo del sitio"
        >
          <Settings className="w-4 h-4" />
          <span className="font-bold text-xs uppercase tracking-wider font-mono">
            Editar estilo
          </span>
        </button>
      </div>

      <ThemeSelectorModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onPersist={onPersist} />
    </>
  );
}
