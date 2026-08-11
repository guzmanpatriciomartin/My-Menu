import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  QrCode, 
  Settings, 
  MapPin, 
  Utensils, 
  ArrowRight, 
  Info, 
  Sparkles, 
  Volume2, 
  CheckCircle,
  HelpCircle,
  Clock,
  Briefcase
} from 'lucide-react';
import { initialEstablishments, initialTables } from '../db/seedData';

interface DemoHomeProps {
  onLaunchClient: (estId: string, tableId: string) => void;
  onLaunchAdmin: () => void;
}

export default function DemoHome({ onLaunchClient, onLaunchAdmin }: DemoHomeProps) {
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
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans py-16 px-6 select-none selection:bg-amber-500 selection:text-zinc-950 relative overflow-hidden">
      
      {/* Massive Background Watermark */}
      <div className="absolute top-0 right-0 pointer-events-none opacity-[0.03] select-none translate-x-12 -translate-y-16">
        <h1 className="text-[260px] md:text-[380px] font-black leading-none tracking-tighter text-white uppercase">
          CORE
        </h1>
      </div>

      {/* Top logo block */}
      <div className="max-w-4xl w-full mx-auto text-left mb-14 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center space-x-2.5 px-3 py-1 rounded border border-zinc-800 bg-zinc-900/55 text-zinc-300 text-[10px] font-black uppercase tracking-[0.25em] mb-6 italic"
        >
          <Sparkles className="w-3 h-3 text-amber-500 animate-spin" style={{ animationDuration: '8s' }} />
          <span>PROYECTO COMPLETO EN PRODUCCIÓN</span>
        </motion.div>
        
        <h1 className="text-5xl md:text-7xl font-sans font-black text-white tracking-tighter leading-none uppercase">
          MI MENU <span className="text-amber-500 font-light">•</span> CHECK TABLE
        </h1>
        <p className="text-xs md:text-sm text-zinc-400 max-w-xl mt-4 leading-relaxed tracking-wide font-medium">
          Digitalización integral de pedidos para locales gastronómicos por QR. Los clientes piden sin demoras y el staff coordina todo desde el centro de administración bajo especificaciones PRD de alto rendimiento.
        </p>
      </div>

      <div className="max-w-4xl w-full mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch relative z-10">
        
        {/* Card 1: Customer View simulation setup */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-zinc-900/40 rounded-none p-8 border border-zinc-850 flex flex-col justify-between h-full relative"
        >
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.3em] font-black text-white bg-zinc-800 inline-block px-2 py-1">
                OBJETIVO 01
              </span>
              <QrCode className="w-5 h-5 text-zinc-400" />
            </div>

            <div>
              <h2 className="text-2xl font-black uppercase tracking-tighter text-white">Módulo del Comensal</h2>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                Simula el escaneo del código QR pegado físicamente en la mesa del local. Permite consultar la carta interactiva, agregar comentarios personalizados y realizar pedidos en tiempo real.
              </p>
            </div>

            {/* Config inputs */}
            <div className="space-y-5 pt-4 border-t border-zinc-800/80">
              <div>
                <label className="block text-[10px] uppercase font-mono tracking-[0.25em] text-zinc-500 font-black mb-2 flex items-center">
                  <MapPin className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
                  1. Elige una Marca gastronómica
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {initialEstablishments.map((est) => (
                    <button
                      id={`launcher-est-btn-${est.id}`}
                      key={est.id}
                      onClick={() => handleEstChange(est.id)}
                      className={`p-4 rounded-none text-xs font-bold border transition text-left flex flex-col justify-between h-[90px] cursor-pointer ${
                        selectedEstId === est.id
                          ? 'border-white bg-zinc-900 text-white shadow-sm'
                          : 'border-zinc-800 bg-transparent text-zinc-500 hover:text-zinc-200 hover:border-zinc-700'
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
                <label className="block text-[10px] uppercase font-mono tracking-[0.25em] text-zinc-500 font-black mb-2 flex items-center">
                  <Clock className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
                  2. Escoge un Número de Mesa
                </label>
                <select
                  id="launcher-table-selector"
                  value={selectedTableId}
                  onChange={(e) => setSelectedTableId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 p-3.5 rounded-none text-xs text-zinc-100 font-bold tracking-wider uppercase focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
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

          <div className="mt-8 pt-6 border-t border-zinc-850">
            <button
              id="btn-launch-demo-client"
              onClick={() => onLaunchClient(selectedEstId, selectedTableId)}
              disabled={selectedTableObj && !selectedTableObj.active}
              className="w-full py-4 rounded-none text-xs font-black text-black bg-white hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-600 transition flex items-center justify-center space-x-2 tracking-[0.2em] uppercase cursor-pointer"
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
          className="bg-zinc-900/40 rounded-none p-8 border border-zinc-850 flex flex-col justify-between h-full"
        >
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.3em] font-black text-white bg-zinc-800 inline-block px-2 py-1">
                OBJETIVO 02
              </span>
              <Settings className="w-5 h-5 text-zinc-400" />
            </div>

            <div>
              <h2 className="text-2xl font-black uppercase tracking-tighter text-white">Módulo de Administración</h2>
              <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                El centro de mando para Carolina (Administradora) o los meseros (como Tomás). Recibe avisos sonoros instantáneos, monitorea la cocina y bloquea platos agotados.
              </p>
            </div>

            <div className="space-y-4 font-mono text-[11px] text-zinc-400 pt-4 p-5 bg-zinc-950/70 rounded-none border border-zinc-800 leading-relaxed">
              <p className="font-extrabold text-white border-b border-zinc-800 pb-2 flex items-center uppercase tracking-widest text-[10px]">
                <Briefcase className="w-3.5 h-3.5 mr-2 text-amber-505" />
                ACCESOS PRECARGADOS PARA TESTS:
              </p>
              
              <div className="space-y-3">
                <div>
                  <p className="text-amber-500 font-black tracking-wide uppercase text-[10px]">🍷 EL BODEGÓN DE PALERMO:</p>
                  <p className="mt-0.5 text-zinc-300">Admin (Carolina): <span className="text-white font-bold">carolina@mimenu.com</span> / <span className="text-zinc-400">admin</span></p>
                  <p className="text-zinc-300">Mesero (Tomás): <span className="text-white font-bold">tomas@mimenu.com</span> / <span className="text-zinc-400">mesero</span></p>
                </div>

                <div className="pt-2 border-t border-zinc-800/80">
                  <p className="text-amber-500 font-black tracking-wide uppercase text-[10px]">☕ CAFÉ & CO. SPEAKEASY:</p>
                  <p className="mt-0.5 text-zinc-300">Admin (Martín): <span className="text-white font-bold">martin@mimenu.com</span> / <span className="text-zinc-400">admin</span></p>
                  <p className="text-zinc-300">Mesera (Sofía): <span className="text-white font-bold">sofia@mimenu.com</span> / <span className="text-zinc-400">mesero</span></p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-zinc-850 font-sans">
            <button
              id="btn-launch-demo-admin"
              onClick={onLaunchAdmin}
              className="w-full py-4 rounded-none text-xs font-black text-black bg-white hover:bg-zinc-200 transition flex items-center justify-center space-x-2 tracking-[0.2em] uppercase cursor-pointer"
            >
              <span>Abrir Centro de Gestión</span>
              <Settings className="w-4 h-4 text-black ml-1" />
            </button>
          </div>
        </motion.div>

      </div>

      {/* Feature showcase footnotes and architecture guidelines */}
      <div className="max-w-4xl w-full mx-auto mt-16 pt-10 border-t border-zinc-800 space-y-6 relative z-10">
        <h3 className="text-[10px] uppercase tracking-[0.3em] font-black text-zinc-550 flex items-center italic">
          <Info className="w-4 h-4 mr-2 text-zinc-500" />
          Especificaciones de conformidad técnica (v0.2 PRD)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 text-xs">
          <div className="bg-zinc-900/25 p-6 rounded-none border border-zinc-800/80 space-y-2">
            <h4 className="font-extrabold uppercase tracking-wide text-zinc-100 font-sans text-sm pb-1 border-b border-zinc-800">Soporte Multi-establecimiento</h4>
            <p className="text-zinc-400 leading-relaxed font-medium">
              La base de datos contiene los dos menús autónomos del PRD. Cambiar la selección en el header aísla automáticamente comandas, mesas e ítems en tiempo real de forma segura.
            </p>
          </div>

          <div className="bg-zinc-900/25 p-6 rounded-none border border-zinc-800/80 space-y-2">
            <h4 className="font-extrabold uppercase tracking-wide text-zinc-100 font-sans text-sm pb-1 border-b border-zinc-800">Notificación Sonora Integrada</h4>
            <p className="text-zinc-400 leading-relaxed font-medium">
              Un timbre doble amigable suena automáticamente en el panel de Carolina en cuanto entra un nuevo pedido, simulando la tiquetera física por Web Audio API de forma interactiva.
            </p>
          </div>

          <div className="bg-zinc-900/25 p-6 rounded-none border border-zinc-800/80 space-y-2">
            <h4 className="font-extrabold uppercase tracking-wide text-zinc-100 font-sans text-sm pb-1 border-b border-zinc-800">Deshabilitación en Cancelación</h4>
            <p className="text-zinc-400 leading-relaxed font-medium">
              Flujo unificado (RF-A07) de rechazo que suspende inmediatamente del menú el insumo agotado para evitar compras reiteradas por parte de los clientes.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
