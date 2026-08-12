import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  QrCode, 
  Settings, 
  MapPin, 
  Utensils, 
  ArrowRight, 
  Volume2, 
  CheckCircle,
  HelpCircle,
  Clock,
  Briefcase
} from 'lucide-react';
import { initialEstablishments, initialTables } from '../db/seedData';
import { useTheme } from '../theme/ThemeContext';

interface DemoHomeProps {
  onLaunchClient: (estId: string, tableId: string) => void;
  onLaunchAdmin: () => void;
}

export default function DemoHome({ onLaunchClient, onLaunchAdmin }: DemoHomeProps) {
  const { classes, isDark } = useTheme();
  const [selectedEstId, setSelectedEstId] = useState('bodegon-palermo');
  const [selectedTableId, setSelectedTableId] = useState('tab-pal-1');

  const activeEstablishment = initialEstablishments.find(e => e.id === selectedEstId);
  
  // Filter tables by current establishment
  const tablesForEst = initialTables.filter(t => t.establishmentId === selectedEstId);

  // Automatically update selected table when establishment switches
  const handleEstChange = (id: string) => {
    setSelectedEstId(id);
    const related = initialTables.find(t => t.establishmentId === id);
    if (related) {
      setSelectedTableId(related.id);
    }
  };

  const selectedTableObj = initialTables.find(t => t.id === selectedTableId);

  return (
    <div className={`min-h-screen ${classes.bgApp} ${classes.textPrimary} flex flex-col font-sans py-16 px-6 select-none relative overflow-hidden transition-colors duration-300`}>
      
      {/* Massive Background Watermark */}
      <div className="absolute top-0 right-0 pointer-events-none opacity-[0.03] select-none translate-x-12 -translate-y-16">
        <h1 className={`text-[260px] md:text-[380px] font-black leading-none tracking-tighter ${classes.textPrimary} uppercase`}>
          CORE
        </h1>
      </div>

      {/* Top logo block */}
      <div className="max-w-4xl w-full mx-auto text-left mb-14 relative z-10">
        <h1 className={`text-5xl md:text-7xl font-sans font-black ${classes.textPrimary} tracking-tighter leading-none uppercase`}>
          MI MENU
        </h1>
      </div>

      <div className="max-w-4xl w-full mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch relative z-10">
        
        {/* Card 1: Customer View simulation setup */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={`${classes.bgCard} ${classes.radiusCard} p-8 border ${classes.borderCard} flex flex-col justify-between h-full relative`}
        >
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] uppercase tracking-[0.3em] font-black ${classes.textPrimary} ${classes.badgeMuted} inline-block px-2 py-1 ${classes.radiusBtn}`}>
                OBJETIVO 01
              </span>
              <QrCode className={`w-5 h-5 ${classes.textMuted}`} />
            </div>

            <div>
              <h2 className={`text-2xl font-black uppercase tracking-tighter ${classes.textPrimary}`}>Módulo del Comensal</h2>
              <p className={`text-xs ${classes.textMuted} mt-2 leading-relaxed`}>
                Simula el escaneo del código QR pegado físicamente en la mesa del local. Permite consultar la carta interactiva, agregar comentarios personalizados y realizar pedidos en tiempo real.
              </p>
            </div>

            {/* Config inputs */}
            <div className={`space-y-5 pt-4 border-t ${classes.borderDivider}`}>
              <div>
                <label className={`block text-[10px] uppercase font-mono tracking-[0.25em] ${classes.textMuted} font-black mb-2 flex items-center`}>
                  <MapPin className="w-3.5 h-3.5 mr-1.5 text-current" />
                  1. Elige una Marca gastronómica
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {initialEstablishments.map((est) => (
                    <button
                      id={`launcher-est-btn-${est.id}`}
                      key={est.id}
                      onClick={() => handleEstChange(est.id)}
                      className={`p-4 ${classes.radiusBtn} text-xs font-bold border transition text-left flex flex-col justify-between h-[90px] cursor-pointer ${
                        selectedEstId === est.id
                          ? `${classes.primaryBtn}`
                          : `${classes.secondaryBtn}`
                      }`}
                    >
                      <span className="line-clamp-1 block uppercase tracking-wider">{est.name}</span>
                      <span className="text-[9px] font-mono font-bold text-amber-500 block tracking-widest uppercase">
                        {est.id === 'bodegon-palermo' ? 'Rústico' : 'Elegante'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={`block text-[10px] uppercase font-mono tracking-[0.25em] ${classes.textMuted} font-black mb-2 flex items-center`}>
                  <Clock className="w-3.5 h-3.5 mr-1.5 text-current" />
                  2. Escoge un Número de Mesa
                </label>
                <select
                  id="launcher-table-selector"
                  value={selectedTableId}
                  onChange={(e) => setSelectedTableId(e.target.value)}
                  className={`w-full ${classes.inputBg} border ${classes.inputBorder} p-3.5 ${classes.radiusCard} text-xs ${classes.textPrimary} font-bold tracking-wider uppercase focus:outline-none`}
                >
                  {tablesForEst.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.active ? '(Activa)' : '(Inactiva)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className={`mt-8 pt-6 border-t ${classes.borderDivider}`}>
            <button
              id="btn-launch-demo-client"
              onClick={() => onLaunchClient(selectedEstId, selectedTableId)}
              disabled={selectedTableObj && !selectedTableObj.active}
              className={`w-full py-4 ${classes.radiusBtn} text-xs font-black ${classes.primaryBtn} disabled:opacity-50 transition flex items-center justify-center space-x-2 tracking-[0.2em] uppercase cursor-pointer`}
            >
              <span>Simular Escaneo ({selectedTableObj?.name || 'Mesa'})</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
            {selectedTableObj && !selectedTableObj.active && (
              <p className="text-[10px] text-rose-500 text-center mt-2 font-black uppercase tracking-wider">
                ⚠️ MESA SUSPENDIDA. Habilítala desde administración.
              </p>
            )}
          </div>
        </motion.div>

        {/* Card 2: Control Admin Panel simulation setup */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`${classes.bgCard} ${classes.radiusCard} p-8 border ${classes.borderCard} flex flex-col justify-between h-full`}
        >
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] uppercase tracking-[0.3em] font-black ${classes.textPrimary} ${classes.badgeMuted} inline-block px-2 py-1 ${classes.radiusBtn}`}>
                OBJETIVO 02
              </span>
              <Settings className={`w-5 h-5 ${classes.textMuted}`} />
            </div>

            <div>
              <h2 className={`text-2xl font-black uppercase tracking-tighter ${classes.textPrimary}`}>Módulo de Administración</h2>
              <p className={`text-xs ${classes.textMuted} mt-2 leading-relaxed`}>
                El centro de mando para Carolina (Administradora) o los meseros (como Tomás). Recibe avisos sonoros instantáneos, monitorea la cocina y bloquea platos agotados.
              </p>
            </div>

            <div className={`space-y-4 font-mono text-[11px] ${classes.textMuted} pt-4 p-5 ${classes.bgCard} ${classes.radiusCard} border ${classes.borderCard} leading-relaxed`}>
              <p className={`font-extrabold ${classes.textPrimary} border-b ${classes.borderDivider} pb-2 flex items-center uppercase tracking-widest text-[10px]`}>
                <Briefcase className="w-3.5 h-3.5 mr-2 text-amber-500" />
                ACCESOS PRECARGADOS PARA TESTS:
              </p>
              
              <div className="space-y-3">
                <div>
                  <p className="text-amber-500 font-black tracking-wide uppercase text-[10px]">🍷 EL BODEGÓN DE PALERMO:</p>
                  <p className={`mt-0.5 ${classes.textSecondary}`}>Admin (Carolina): <span className={`font-bold ${classes.textPrimary}`}>carolina@mimenu.com</span> / <span className={`${classes.textMuted}`}>admin</span></p>
                  <p className={`${classes.textSecondary}`}>Mesero (Tomás): <span className={`font-bold ${classes.textPrimary}`}>tomas@mimenu.com</span> / <span className={`${classes.textMuted}`}>mesero</span></p>
                </div>

                <div className={`pt-2 border-t ${classes.borderDivider}`}>
                  <p className="text-amber-500 font-black tracking-wide uppercase text-[10px]">☕ CAFÉ & CO. SPEAKEASY:</p>
                  <p className={`mt-0.5 ${classes.textSecondary}`}>Admin (Martín): <span className={`font-bold ${classes.textPrimary}`}>martin@mimenu.com</span> / <span className={`${classes.textMuted}`}>admin</span></p>
                  <p className={`${classes.textSecondary}`}>Mesera (Sofía): <span className={`font-bold ${classes.textPrimary}`}>sofia@mimenu.com</span> / <span className={`${classes.textMuted}`}>mesero</span></p>
                </div>
              </div>
            </div>
          </div>

          <div className={`mt-8 pt-6 border-t ${classes.borderDivider} font-sans`}>
            <button
              id="btn-launch-demo-admin"
              onClick={onLaunchAdmin}
              className={`w-full py-4 ${classes.radiusBtn} text-xs font-black ${classes.primaryBtn} transition flex items-center justify-center space-x-2 tracking-[0.2em] uppercase cursor-pointer`}
            >
              <span>Abrir Centro de Gestión</span>
              <Settings className="w-4 h-4 ml-1" />
            </button>
          </div>
        </motion.div>

      </div>

    </div>
  );
}

