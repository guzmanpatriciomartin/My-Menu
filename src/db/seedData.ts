import {
  Establishment,
  Category,
  MenuItem,
  Table,
  Order,
  TableCall,
  CashClose,
  CashRegisterSession,
  ProductLine,
  TableLine,
  CashCloseTotals,
} from '../types';

export const initialEstablishments: Establishment[] = [
  {
    id: 'bodegon-palermo',
    name: 'El Bodegón de Palermo',
    description: 'Bodegón tradicional porteño. Comidas abundantes, caseras y un ambiente cálido para compartir en familia o con amigos.',
    accentColor: '#9a1c1c', // Rust Red
  },
  {
    id: 'cafe-speakeasy',
    name: 'Café & Co. Speakeasy',
    description: 'Espacio de café de especialidad de día y bar oculto de tragos de autor de noche. Estilo minimalista y moderno.',
    accentColor: '#1d4ed8', // Royal Blue
  }
];

export const initialCategories: Category[] = [
  // Bodegón Palermo Categories
  { id: 'cat-palermo-entradas', establishmentId: 'bodegon-palermo', name: 'Entradas', order: 1 },
  { id: 'cat-palermo-minutas', establishmentId: 'bodegon-palermo', name: 'Platos Principales', order: 2 },
  { id: 'cat-palermo-postres', establishmentId: 'bodegon-palermo', name: 'Postres Caseros', order: 3 },
  { id: 'cat-palermo-bebidas', establishmentId: 'bodegon-palermo', name: 'Bebidas e Infusiones', order: 4 },

  // Café & Co. Speakeasy Categories
  { id: 'cat-cafe-cafeteria', establishmentId: 'cafe-speakeasy', name: 'Café de Especialidad', order: 1 },
  { id: 'cat-cafe-pasteleria', establishmentId: 'cafe-speakeasy', name: 'Pastelería Francesa', order: 2 },
  { id: 'cat-cafe-tragos', establishmentId: 'cafe-speakeasy', name: 'Tragos de Autor', order: 3 },
  { id: 'cat-cafe-tapeo', establishmentId: 'cafe-speakeasy', name: 'Tapeo & Platitos', order: 4 },
];

export const initialMenuItems: MenuItem[] = [
  // Bodegón Palermo Items
  {
    id: 'item-palermo-empanada',
    establishmentId: 'bodegon-palermo',
    categoryId: 'cat-palermo-entradas',
    name: 'Empanada de Carne Cortada a Cuchillo',
    description: 'Tradicional empanada frita elaborada con bola de lomo tiernizada cortada a cuchillo, cebolla de verdeo, huevo duro y comino norteño.',
    price: 1300,
    imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=400',
    available: true,
  },
  {
    id: 'item-palermo-provoleta',
    establishmentId: 'bodegon-palermo',
    categoryId: 'cat-palermo-entradas',
    name: 'Provoleta Clásica al Hierro',
    description: 'Queso provolone hilado cocido a la plancha de hierro fundido, crocante por fuera y fundido por dentro, con orégano y un toque de oliva virgen extra.',
    price: 4500,
    imageUrl: 'https://images.unsplash.com/photo-1559561853-08451507cbe7?auto=format&fit=crop&q=80&w=400',
    available: true,
  },
  {
    id: 'item-palermo-mila-napo',
    establishmentId: 'bodegon-palermo',
    categoryId: 'cat-palermo-minutas',
    name: 'Milanesa de Ternera a la Napolitana',
    description: 'Suprema de ternera tierna rebozada con pan rallado casero, cubierta con salsa de tomates frescos, jamón cocido de primera calidad y queso muzzarella gratinado. Incluye acompañamiento de papas fritas rústicas bastón.',
    price: 9800,
    imageUrl: 'https://images.unsplash.com/photo-1606755456206-b25206cde27e?auto=format&fit=crop&q=80&w=400',
    available: true,
  },
  {
    id: 'item-palermo-bife',
    establishmentId: 'bodegon-palermo',
    categoryId: 'cat-palermo-minutas',
    name: 'Bife de Chorizo Clásico (400g)',
    description: 'Bife de chorizo angus cortado grueso y asado en su punto justo. Servido con un toque de sal marina, acompañado de chimichurri de la casa y salsa criolla hecha en el día.',
    price: 12500,
    imageUrl: 'https://images.unsplash.com/photo-1546964124-0cce460f38ef?auto=format&fit=crop&q=80&w=400',
    available: true,
  },
  {
    id: 'item-palermo-flan',
    establishmentId: 'bodegon-palermo',
    categoryId: 'cat-palermo-postres',
    name: 'Flan Mixto Tradicional',
    description: 'Flan casero de 8 huevos, cremoso y con caramelo rubio. Servido con una bocha de dulce de leche artesanal hilado y otra de crema batida natural.',
    price: 2200,
    imageUrl: 'https://images.unsplash.com/photo-1516685018646-549198525c1b?auto=format&fit=crop&q=80&w=400',
    available: true,
  },
  {
    id: 'item-palermo-don-pedro',
    establishmentId: 'bodegon-palermo',
    categoryId: 'cat-palermo-postres',
    name: 'Copa Don Pedro Especial',
    description: 'Helado de crema americana premium bañado con un generoso chorro de whisky añejo de malta, decorado con nueces pecanas partidas y crocantes.',
    price: 3000,
    imageUrl: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&q=80&w=400',
    available: true,
  },
  {
    id: 'item-palermo-ipa',
    establishmentId: 'bodegon-palermo',
    categoryId: 'cat-palermo-bebidas',
    name: 'Cerveza Tirada IPA (Pinta)',
    description: 'Cerveza artesanal local de alta fermentación. Destaca por su intenso aroma cítrico y floral de lúpulos patagónicos y un amargor limpio y refrescante.',
    price: 2500,
    imageUrl: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?auto=format&fit=crop&q=80&w=400',
    available: true,
  },
  {
    id: 'item-palermo-limonada',
    establishmentId: 'bodegon-palermo',
    categoryId: 'cat-palermo-bebidas',
    name: 'Limonada de Menta y Jengibre',
    description: 'Exprimido fresco de limones maduros, licuado con hojas frescas de menta orgánica, jengibre fresco rallado y endulzado a gusto.',
    price: 1800,
    imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=400',
    available: true,
  },

  // Café & Co. Speakeasy Items
  {
    id: 'item-cafe-flatwhite',
    establishmentId: 'cafe-speakeasy',
    categoryId: 'cat-cafe-cafeteria',
    name: 'Avocado Flat White',
    description: 'Doble shot de espresso de granos de especialidad de origen colombiano, leche orgánica texturizada y un sutil, cremoso toque de aceite de palta orgánica infusionado.',
    price: 2100,
    imageUrl: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&q=80&w=400',
    available: true,
  },
  {
    id: 'item-cafe-coldbrew',
    establishmentId: 'cafe-speakeasy',
    categoryId: 'cat-cafe-cafeteria',
    name: 'Cold Brew Tonic & Grapefruit',
    description: 'Café de especialidad infusionado en frío por 18 horas, servido sobre hielo cilíndrico de alta pureza con agua tónica Premium y una rodaja de pomelo rosado sopleteada.',
    price: 2300,
    imageUrl: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&q=80&w=400',
    available: true,
  },
  {
    id: 'item-cafe-croissant',
    establishmentId: 'cafe-speakeasy',
    categoryId: 'cat-cafe-pasteleria',
    name: 'Croissant Hojaldrado de Pistachos',
    description: 'Hojaldre de pura manteca elaborado mediante 24 horas de fermentación lenta, relleno con una untuosa ganache de pistachos tostados de Mendoza.',
    price: 2500,
    imageUrl: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&q=80&w=400',
    available: true,
  },
  {
    id: 'item-cafe-cinnamon',
    establishmentId: 'cafe-speakeasy',
    categoryId: 'cat-cafe-pasteleria',
    name: 'Roll de Canela y Pacanas',
    description: 'Masa brioche enrollada con manteca de canela de Ceilán, horneado y bañado con un frosting sedoso de queso crema, terminado con pacanas caramelizadas crujientes.',
    price: 2000,
    imageUrl: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=400',
    available: true,
  },
  {
    id: 'item-cafe-negroni',
    establishmentId: 'cafe-speakeasy',
    categoryId: 'cat-cafe-tragos',
    name: 'Smoked Rosemary Negroni',
    description: 'Cocktail balanceado con partes iguales de Gin artesanal, Vermouth Rosso selecto y Campari italiano macerado. Servido con una rama de romero fresco ahumada con soplete al instante.',
    price: 4500,
    imageUrl: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&q=80&w=400',
    available: true,
  },
  {
    id: 'item-cafe-spritz',
    establishmentId: 'cafe-speakeasy',
    categoryId: 'cat-cafe-tragos',
    name: 'Elderflower Spritz Floral',
    description: 'Licor fino de flor de saúco, espumante extra brut local de corte premium, golpe de soda helada y hojas de menta fresca.',
    price: 4200,
    imageUrl: 'https://images.unsplash.com/photo-1574085733277-851d9d856a3a?auto=format&fit=crop&q=80&w=400',
    available: true,
  },
  {
    id: 'item-cafe-tabla',
    establishmentId: 'cafe-speakeasy',
    categoryId: 'cat-cafe-tapeo',
    name: 'Tabla Seleccionada de Charcutería',
    description: 'Queso brie patagónico maduro, queso gouda ahumado, jamón serrano reserva de 12 meses, salame criollo de Tandil, aceitunas marinadas en hierbas y tostadas de focaccia artesanal.',
    price: 7800,
    imageUrl: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&q=80&w=400',
    available: true,
  },
  {
    id: 'item-cafe-bravas',
    establishmentId: 'cafe-speakeasy',
    categoryId: 'cat-cafe-tapeo',
    name: 'Papas Bravas de Papa Triple Cocción',
    description: 'Dados de papa crocantes con método de triple cocción (esponjosas en el centro, crocantes afuera), acompañadas de salsa brava picante ahumada con pimentón de Cachi y alioli sedoso de ajos confitados.',
    price: 3500,
    imageUrl: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&q=80&w=400',
    available: true,
  }
];

export const initialTables: Table[] = [
  // Bodegón Palermo
  { id: 'tab-pal-1', establishmentId: 'bodegon-palermo', name: 'Mesa 1', active: true },
  { id: 'tab-pal-2', establishmentId: 'bodegon-palermo', name: 'Mesa 2', active: true },
  { id: 'tab-pal-3', establishmentId: 'bodegon-palermo', name: 'Mesa 3', active: true },
  { id: 'tab-pal-4', establishmentId: 'bodegon-palermo', name: 'Mesa 4', active: true },
  { id: 'tab-pal-5', establishmentId: 'bodegon-palermo', name: 'Mesa 5', active: true },
  { id: 'tab-pal-sub', establishmentId: 'bodegon-palermo', name: 'Mesa Barra 1', active: true },
  { id: 'tab-pal-out', establishmentId: 'bodegon-palermo', name: 'Mesa Exterior 9', active: false },

  // Café & Co. Speakeasy
  { id: 'tab-caf-1', establishmentId: 'cafe-speakeasy', name: 'Mesa A1', active: true },
  { id: 'tab-caf-2', establishmentId: 'cafe-speakeasy', name: 'Mesa A2', active: true },
  { id: 'tab-caf-3', establishmentId: 'cafe-speakeasy', name: 'Mesa de Ventana', active: true },
  { id: 'tab-caf-4', establishmentId: 'cafe-speakeasy', name: 'Sillón Comedor', active: true },
];

/**
 * Helper to construct ISO strings relative to venue local time (America/Argentina/Buenos_Aires).
 * offsetDays: 0 = today, -1 = yesterday, -2 = 2 days ago, etc.
 * hour: 0-23 in venue local time.
 *
 * Today's schedule spans a full service day (lunch through 21:30 dinner), so whenever the
 * seed runs before those hours the naive instant lands in the future. That is not a
 * cosmetic problem: a register whose openedAt has not happened yet produces a close with
 * periodStart after periodEnd, and openPeriodStart() then anchors the next period to a
 * close that has not occurred. Never returning a future instant keeps every fixture in the
 * past regardless of when the demo boots.
 *
 * Clamping is monotonic, so relative order is preserved (createdAt never ends up after
 * deliveredAt). Events that clamp collapse onto the same instant, which is why the by-hour
 * chart can show today's later shift bunched at the current hour when the demo runs early.
 * A pile-up in a demo chart is a fair trade for money records that cannot invert.
 */
export function getVenueIsoDate(offsetDays: number = 0, hour: number = 12, minute: number = 0): string {
  const now = new Date();
  const arFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = arFormatter.format(now);
  const [y, m, d] = todayStr.split('-').map(Number);

  const baseDate = new Date(Date.UTC(y, m - 1, d + offsetDays));
  const year = baseDate.getUTCFullYear();
  const month = baseDate.getUTCMonth() + 1;
  const day = baseDate.getUTCDate();

  // Convertir hora local Argentina (UTC-3) a UTC sumando 3 horas
  const utcHour = hour + 3;
  const date = new Date(Date.UTC(year, month - 1, day, utcHour % 24, minute, 0));
  // Si utcHour >= 24, agregar un día
  if (utcHour >= 24) date.setUTCDate(date.getUTCDate() + 1);

  // A minute of margin keeps a clamped openedAt strictly before the periodEnd that a close
  // stamps with the wall clock, so the recorded period stays positive rather than zero.
  const latest = now.getTime() - 60_000;
  return new Date(Math.min(date.getTime(), latest)).toISOString();
}

/**
 * Generates rich, realistic test data for orders across:
 * - Today: delivered orders from closed earlier shift, delivered orders pending cash close, active orders, and cancelled order.
 * - Yesterday: lunch and dinner delivered orders for day-over-day metrics.
 * - Past 2-7 days: delivered orders for weekly average comparisons.
 */
export function generateSeedOrders(): Order[] {
  const orders: Order[] = [
    // ----------------------------------------------------
    // EL BODEGÓN DE PALERMO (bodegon-palermo)
    // ----------------------------------------------------

    // --- HOY: Turno Almuerzo (Ya cerrados en cashClose "close-pal-almuerzo-today") ---
    {
      id: 'ord-pal-today-1',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-1',
      tableName: 'Mesa 1',
      dinerName: 'Agustín P.',
      items: [
        { id: 'item-o-1', menuItemId: 'item-palermo-empanada', name: 'Empanada de Carne Cortada a Cuchillo', price: 1300, quantity: 2 },
        { id: 'item-o-2', menuItemId: 'item-palermo-mila-napo', name: 'Milanesa de Ternera a la Napolitana', price: 9800, quantity: 1 },
        { id: 'item-o-3', menuItemId: 'item-palermo-ipa', name: 'Cerveza Tirada IPA (Pinta)', price: 2500, quantity: 2 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(0, 12, 30),
      updatedAt: getVenueIsoDate(0, 13, 10),
      deliveredAt: getVenueIsoDate(0, 13, 10),
      paymentStatus: 'paid',
      cashCloseId: 'close-pal-almuerzo-today',
    },
    {
      id: 'ord-pal-today-2',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-2',
      tableName: 'Mesa 2',
      dinerName: 'Familia Rossi',
      items: [
        { id: 'item-o-4', menuItemId: 'item-palermo-provoleta', name: 'Provoleta Clásica al Hierro', price: 4500, quantity: 2 },
        { id: 'item-o-5', menuItemId: 'item-palermo-bife', name: 'Bife de Chorizo Clásico (400g)', price: 12500, quantity: 2 },
        { id: 'item-o-6', menuItemId: 'item-palermo-flan', name: 'Flan Mixto Tradicional', price: 2200, quantity: 2 },
        { id: 'item-o-7', menuItemId: 'item-palermo-limonada', name: 'Limonada de Menta y Jengibre', price: 1800, quantity: 2 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(0, 13, 0),
      updatedAt: getVenueIsoDate(0, 13, 45),
      deliveredAt: getVenueIsoDate(0, 13, 45),
      paymentStatus: 'paid',
      cashCloseId: 'close-pal-almuerzo-today',
    },
    {
      id: 'ord-pal-today-3',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-3',
      tableName: 'Mesa 3',
      dinerName: 'Carolina M.',
      items: [
        { id: 'item-o-8', menuItemId: 'item-palermo-mila-napo', name: 'Milanesa de Ternera a la Napolitana', price: 9800, quantity: 1 },
        { id: 'item-o-9', menuItemId: 'item-palermo-ipa', name: 'Cerveza Tirada IPA (Pinta)', price: 2500, quantity: 1 },
        { id: 'item-o-10', menuItemId: 'item-palermo-don-pedro', name: 'Copa Don Pedro Especial', price: 3000, quantity: 1 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(0, 13, 40),
      updatedAt: getVenueIsoDate(0, 14, 20),
      deliveredAt: getVenueIsoDate(0, 14, 20),
      paymentStatus: 'paid',
      cashCloseId: 'close-pal-almuerzo-today',
    },
    {
      id: 'ord-pal-today-4',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-sub',
      tableName: 'Mesa Barra 1',
      dinerName: 'Mariano B.',
      items: [
        { id: 'item-o-11', menuItemId: 'item-palermo-empanada', name: 'Empanada de Carne Cortada a Cuchillo', price: 1300, quantity: 3 },
        { id: 'item-o-12', menuItemId: 'item-palermo-ipa', name: 'Cerveza Tirada IPA (Pinta)', price: 2500, quantity: 2 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(0, 14, 10),
      updatedAt: getVenueIsoDate(0, 14, 40),
      deliveredAt: getVenueIsoDate(0, 14, 40),
      paymentStatus: 'paid',
      cashCloseId: 'close-pal-almuerzo-today',
    },

    // --- HOY: Turno Actual (ENTREGADOS PENDIENTES DE CIERRE DE CAJA) ---
    // Estos pedidos alimentan el preview de /api/my/cash-close/preview y las métricas de hoy.
    {
      id: 'ord-pal-pend-1',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-1',
      tableName: 'Mesa 1',
      dinerName: 'Gonzalo G.',
      items: [
        { id: 'item-o-13', menuItemId: 'item-palermo-provoleta', name: 'Provoleta Clásica al Hierro', price: 4500, quantity: 1, comment: 'Bien dorada' },
        { id: 'item-o-14', menuItemId: 'item-palermo-bife', name: 'Bife de Chorizo Clásico (400g)', price: 12500, quantity: 2, comment: 'Punto jugoso' },
        { id: 'item-o-15', menuItemId: 'item-palermo-ipa', name: 'Cerveza Tirada IPA (Pinta)', price: 2500, quantity: 3 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(0, 19, 15),
      updatedAt: getVenueIsoDate(0, 19, 50),
      deliveredAt: getVenueIsoDate(0, 19, 50),
      paymentStatus: 'paid',
      // cashCloseId is undefined: ready for cash closing!
    },
    {
      id: 'ord-pal-pend-2',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-2',
      tableName: 'Mesa 2',
      dinerName: 'Sofía & Nicolás',
      items: [
        { id: 'item-o-16', menuItemId: 'item-palermo-mila-napo', name: 'Milanesa de Ternera a la Napolitana', price: 9800, quantity: 2 },
        { id: 'item-o-17', menuItemId: 'item-palermo-flan', name: 'Flan Mixto Tradicional', price: 2200, quantity: 2 },
        { id: 'item-o-18', menuItemId: 'item-palermo-limonada', name: 'Limonada de Menta y Jengibre', price: 1800, quantity: 2 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(0, 19, 45),
      updatedAt: getVenueIsoDate(0, 20, 25),
      deliveredAt: getVenueIsoDate(0, 20, 25),
      paymentStatus: 'paid',
    },
    {
      id: 'ord-pal-pend-3',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-4',
      tableName: 'Mesa 4',
      dinerName: 'Mesa Amigos',
      items: [
        { id: 'item-o-19', menuItemId: 'item-palermo-empanada', name: 'Empanada de Carne Cortada a Cuchillo', price: 1300, quantity: 6 },
        { id: 'item-o-20', menuItemId: 'item-palermo-provoleta', name: 'Provoleta Clásica al Hierro', price: 4500, quantity: 2 },
        { id: 'item-o-21', menuItemId: 'item-palermo-bife', name: 'Bife de Chorizo Clásico (400g)', price: 12500, quantity: 1 },
        { id: 'item-o-22', menuItemId: 'item-palermo-ipa', name: 'Cerveza Tirada IPA (Pinta)', price: 2500, quantity: 4 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(0, 20, 10),
      updatedAt: getVenueIsoDate(0, 20, 55),
      deliveredAt: getVenueIsoDate(0, 20, 55),
      paymentStatus: 'paid',
    },
    {
      id: 'ord-pal-pend-4',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-3',
      tableName: 'Mesa 3',
      dinerName: 'Lucas V.',
      items: [
        { id: 'item-o-23', menuItemId: 'item-palermo-mila-napo', name: 'Milanesa de Ternera a la Napolitana', price: 9800, quantity: 1 },
        { id: 'item-o-24', menuItemId: 'item-palermo-don-pedro', name: 'Copa Don Pedro Especial', price: 3000, quantity: 1 },
        { id: 'item-o-25', menuItemId: 'item-palermo-ipa', name: 'Cerveza Tirada IPA (Pinta)', price: 2500, quantity: 1 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(0, 20, 40),
      updatedAt: getVenueIsoDate(0, 21, 15),
      deliveredAt: getVenueIsoDate(0, 21, 15),
      paymentStatus: 'paid',
    },
    {
      id: 'ord-pal-pend-5',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-sub',
      tableName: 'Mesa Barra 1',
      dinerName: 'Federico T.',
      items: [
        { id: 'item-o-26', menuItemId: 'item-palermo-empanada', name: 'Empanada de Carne Cortada a Cuchillo', price: 1300, quantity: 4 },
        { id: 'item-o-27', menuItemId: 'item-palermo-ipa', name: 'Cerveza Tirada IPA (Pinta)', price: 2500, quantity: 2 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(0, 21, 0),
      updatedAt: getVenueIsoDate(0, 21, 30),
      deliveredAt: getVenueIsoDate(0, 21, 30),
      paymentStatus: 'paid',
    },

    // --- HOY: Pedidos Activos en Cocina y Salón (Para la comanda en vivo) ---
    {
      id: 'ord-pal-act-1',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-1',
      tableName: 'Mesa 1',
      dinerName: 'Valeria S.',
      items: [
        { id: 'item-o-28', menuItemId: 'item-palermo-empanada', name: 'Empanada de Carne Cortada a Cuchillo', price: 1300, quantity: 3, comment: 'Bien calientes' },
        { id: 'item-o-29', menuItemId: 'item-palermo-bife', name: 'Bife de Chorizo Clásico (400g)', price: 12500, quantity: 1, comment: 'A punto' },
      ],
      status: 'Recibido',
      createdAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      paymentStatus: null,
    },
    {
      id: 'ord-pal-act-2',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-3',
      tableName: 'Mesa 3',
      dinerName: 'Lucas M.',
      items: [
        { id: 'item-o-30', menuItemId: 'item-palermo-provoleta', name: 'Provoleta Clásica al Hierro', price: 4500, quantity: 1 },
        { id: 'item-o-31', menuItemId: 'item-palermo-mila-napo', name: 'Milanesa de Ternera a la Napolitana', price: 9800, quantity: 1, comment: 'Papas bien crocantes' },
      ],
      status: 'En preparación',
      createdAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      paymentStatus: null,
    },
    {
      id: 'ord-pal-act-3',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-5',
      tableName: 'Mesa 5',
      dinerName: 'Santiago P.',
      items: [
        { id: 'item-o-32', menuItemId: 'item-palermo-empanada', name: 'Empanada de Carne Cortada a Cuchillo', price: 1300, quantity: 2 },
        { id: 'item-o-33', menuItemId: 'item-palermo-ipa', name: 'Cerveza Tirada IPA (Pinta)', price: 2500, quantity: 2 },
      ],
      status: 'En preparación',
      createdAt: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      paymentStatus: null,
    },
    {
      id: 'ord-pal-act-4',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-2',
      tableName: 'Mesa 2',
      dinerName: 'Martina G.',
      items: [
        { id: 'item-o-34', menuItemId: 'item-palermo-bife', name: 'Bife de Chorizo Clásico (400g)', price: 12500, quantity: 1 },
      ],
      status: 'Listo',
      createdAt: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      paymentStatus: null,
    },
    {
      id: 'ord-pal-canc-1',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-4',
      tableName: 'Mesa 4',
      dinerName: 'Cliente Mesa 4',
      items: [
        { id: 'item-o-35', menuItemId: 'item-palermo-mila-napo', name: 'Milanesa de Ternera a la Napolitana', price: 9800, quantity: 1 },
      ],
      status: 'Cancelado',
      cancellationReason: 'El cliente tuvo que retirarse por urgencia familiar',
      createdAt: getVenueIsoDate(0, 18, 30),
      updatedAt: getVenueIsoDate(0, 18, 35),
      paymentStatus: null,
    },

    // --- AYER: Historial de Ventas (Bodegón Palermo) ---
    {
      id: 'ord-pal-yest-1',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-1',
      tableName: 'Mesa 1',
      items: [
        { id: 'item-oy-1', menuItemId: 'item-palermo-mila-napo', name: 'Milanesa de Ternera a la Napolitana', price: 9800, quantity: 2 },
        { id: 'item-oy-2', menuItemId: 'item-palermo-ipa', name: 'Cerveza Tirada IPA (Pinta)', price: 2500, quantity: 2 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(-1, 12, 45),
      updatedAt: getVenueIsoDate(-1, 13, 20),
      deliveredAt: getVenueIsoDate(-1, 13, 20),
      paymentStatus: 'paid',
      cashCloseId: 'close-pal-cierre-ayer',
    },
    {
      id: 'ord-pal-yest-2',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-2',
      tableName: 'Mesa 2',
      items: [
        { id: 'item-oy-3', menuItemId: 'item-palermo-provoleta', name: 'Provoleta Clásica al Hierro', price: 4500, quantity: 1 },
        { id: 'item-oy-4', menuItemId: 'item-palermo-bife', name: 'Bife de Chorizo Clásico (400g)', price: 12500, quantity: 2 },
        { id: 'item-oy-5', menuItemId: 'item-palermo-flan', name: 'Flan Mixto Tradicional', price: 2200, quantity: 2 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(-1, 13, 15),
      updatedAt: getVenueIsoDate(-1, 14, 0),
      deliveredAt: getVenueIsoDate(-1, 14, 0),
      paymentStatus: 'paid',
      cashCloseId: 'close-pal-cierre-ayer',
    },
    {
      id: 'ord-pal-yest-3',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-3',
      tableName: 'Mesa 3',
      items: [
        { id: 'item-oy-6', menuItemId: 'item-palermo-empanada', name: 'Empanada de Carne Cortada a Cuchillo', price: 1300, quantity: 4 },
        { id: 'item-oy-7', menuItemId: 'item-palermo-limonada', name: 'Limonada de Menta y Jengibre', price: 1800, quantity: 2 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(-1, 14, 0),
      updatedAt: getVenueIsoDate(-1, 14, 30),
      deliveredAt: getVenueIsoDate(-1, 14, 30),
      paymentStatus: 'paid',
      cashCloseId: 'close-pal-cierre-ayer',
    },
    {
      id: 'ord-pal-yest-4',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-1',
      tableName: 'Mesa 1',
      items: [
        { id: 'item-oy-8', menuItemId: 'item-palermo-bife', name: 'Bife de Chorizo Clásico (400g)', price: 12500, quantity: 1 },
        { id: 'item-oy-9', menuItemId: 'item-palermo-ipa', name: 'Cerveza Tirada IPA (Pinta)', price: 2500, quantity: 2 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(-1, 20, 0),
      updatedAt: getVenueIsoDate(-1, 20, 35),
      deliveredAt: getVenueIsoDate(-1, 20, 35),
      paymentStatus: 'paid',
      cashCloseId: 'close-pal-cierre-ayer',
    },
    {
      id: 'ord-pal-yest-5',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-4',
      tableName: 'Mesa 4',
      items: [
        { id: 'item-oy-10', menuItemId: 'item-palermo-mila-napo', name: 'Milanesa de Ternera a la Napolitana', price: 9800, quantity: 3 },
        { id: 'item-oy-11', menuItemId: 'item-palermo-don-pedro', name: 'Copa Don Pedro Especial', price: 3000, quantity: 2 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(-1, 20, 45),
      updatedAt: getVenueIsoDate(-1, 21, 30),
      deliveredAt: getVenueIsoDate(-1, 21, 30),
      paymentStatus: 'paid',
      cashCloseId: 'close-pal-cierre-ayer',
    },
    {
      id: 'ord-pal-yest-6',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-5',
      tableName: 'Mesa 5',
      items: [
        { id: 'item-oy-12', menuItemId: 'item-palermo-provoleta', name: 'Provoleta Clásica al Hierro', price: 4500, quantity: 2 },
        { id: 'item-oy-13', menuItemId: 'item-palermo-empanada', name: 'Empanada de Carne Cortada a Cuchillo', price: 1300, quantity: 6 },
        { id: 'item-oy-14', menuItemId: 'item-palermo-ipa', name: 'Cerveza Tirada IPA (Pinta)', price: 2500, quantity: 4 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(-1, 21, 15),
      updatedAt: getVenueIsoDate(-1, 22, 0),
      deliveredAt: getVenueIsoDate(-1, 22, 0),
      paymentStatus: 'paid',
      cashCloseId: 'close-pal-cierre-ayer',
    },

    // --- DÍAS -2 a -7 (Historial para promedio semanal) ---
    ...[-2, -3, -4, -5, -6, -7].flatMap((d) => [
      {
        id: `ord-pal-hist-${d}-1`,
        establishmentId: 'bodegon-palermo',
        tableId: 'tab-pal-1',
        tableName: 'Mesa 1',
        items: [
          { id: `item-oh-${d}-1`, menuItemId: 'item-palermo-mila-napo', name: 'Milanesa de Ternera a la Napolitana', price: 9800, quantity: 2 },
          { id: `item-oh-${d}-2`, menuItemId: 'item-palermo-ipa', name: 'Cerveza Tirada IPA (Pinta)', price: 2500, quantity: 2 },
        ],
        status: 'Entregado' as const,
        createdAt: getVenueIsoDate(d, 13, 0),
        updatedAt: getVenueIsoDate(d, 13, 40),
        deliveredAt: getVenueIsoDate(d, 13, 40),
        paymentStatus: 'paid' as const,
        cashCloseId: `close-pal-hist-${d}`,
      },
      {
        id: `ord-pal-hist-${d}-2`,
        establishmentId: 'bodegon-palermo',
        tableId: 'tab-pal-2',
        tableName: 'Mesa 2',
        items: [
          { id: `item-oh-${d}-3`, menuItemId: 'item-palermo-bife', name: 'Bife de Chorizo Clásico (400g)', price: 12500, quantity: 2 },
          { id: `item-oh-${d}-4`, menuItemId: 'item-palermo-provoleta', name: 'Provoleta Clásica al Hierro', price: 4500, quantity: 1 },
          { id: `item-oh-${d}-5`, menuItemId: 'item-palermo-flan', name: 'Flan Mixto Tradicional', price: 2200, quantity: 1 },
        ],
        status: 'Entregado' as const,
        createdAt: getVenueIsoDate(d, 20, 30),
        updatedAt: getVenueIsoDate(d, 21, 15),
        deliveredAt: getVenueIsoDate(d, 21, 15),
        paymentStatus: 'paid' as const,
        cashCloseId: `close-pal-hist-${d}`,
      },
      {
        id: `ord-pal-hist-${d}-3`,
        establishmentId: 'bodegon-palermo',
        tableId: 'tab-pal-3',
        tableName: 'Mesa 3',
        items: [
          { id: `item-oh-${d}-6`, menuItemId: 'item-palermo-empanada', name: 'Empanada de Carne Cortada a Cuchillo', price: 1300, quantity: 4 },
          { id: `item-oh-${d}-7`, menuItemId: 'item-palermo-ipa', name: 'Cerveza Tirada IPA (Pinta)', price: 2500, quantity: 3 },
        ],
        status: 'Entregado' as const,
        createdAt: getVenueIsoDate(d, 21, 30),
        updatedAt: getVenueIsoDate(d, 22, 10),
        deliveredAt: getVenueIsoDate(d, 22, 10),
        paymentStatus: 'paid' as const,
        cashCloseId: `close-pal-hist-${d}`,
      },
    ]),

    // ----------------------------------------------------
    // CAFÉ & CO. SPEAKEASY (cafe-speakeasy)
    // ----------------------------------------------------

    // --- HOY: Café Speakeasy (Cerrados mañana + Pendientes tarde/noche) ---
    {
      id: 'ord-caf-today-1',
      establishmentId: 'cafe-speakeasy',
      tableId: 'tab-caf-1',
      tableName: 'Mesa A1',
      dinerName: 'Camila F.',
      items: [
        { id: 'item-oc-1', menuItemId: 'item-cafe-flatwhite', name: 'Avocado Flat White', price: 2100, quantity: 2 },
        { id: 'item-oc-2', menuItemId: 'item-cafe-croissant', name: 'Croissant Hojaldrado de Pistachos', price: 2500, quantity: 2 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(0, 9, 30),
      updatedAt: getVenueIsoDate(0, 9, 50),
      deliveredAt: getVenueIsoDate(0, 9, 50),
      paymentStatus: 'paid',
      cashCloseId: 'close-caf-matutino-today',
    },
    {
      id: 'ord-caf-today-2',
      establishmentId: 'cafe-speakeasy',
      tableId: 'tab-caf-3',
      tableName: 'Mesa de Ventana',
      dinerName: 'Mateo R.',
      items: [
        { id: 'item-oc-3', menuItemId: 'item-cafe-coldbrew', name: 'Cold Brew Tonic & Grapefruit', price: 2300, quantity: 1 },
        { id: 'item-oc-4', menuItemId: 'item-cafe-cinnamon', name: 'Roll de Canela y Pacanas', price: 2000, quantity: 1 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(0, 11, 15),
      updatedAt: getVenueIsoDate(0, 11, 35),
      deliveredAt: getVenueIsoDate(0, 11, 35),
      paymentStatus: 'paid',
      cashCloseId: 'close-caf-matutino-today',
    },
    {
      id: 'ord-caf-pend-1',
      establishmentId: 'cafe-speakeasy',
      tableId: 'tab-caf-2',
      tableName: 'Mesa A2',
      dinerName: 'Paula & Julián',
      items: [
        { id: 'item-oc-5', menuItemId: 'item-cafe-negroni', name: 'Smoked Rosemary Negroni', price: 4500, quantity: 2 },
        { id: 'item-oc-6', menuItemId: 'item-cafe-tabla', name: 'Tabla Seleccionada de Charcutería', price: 7800, quantity: 1 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(0, 19, 30),
      updatedAt: getVenueIsoDate(0, 20, 0),
      deliveredAt: getVenueIsoDate(0, 20, 0),
      paymentStatus: 'paid',
      // Pending cash close
    },
    {
      id: 'ord-caf-pend-2',
      establishmentId: 'cafe-speakeasy',
      tableId: 'tab-caf-4',
      tableName: 'Sillón Comedor',
      dinerName: 'Grupo After Office',
      items: [
        { id: 'item-oc-7', menuItemId: 'item-cafe-spritz', name: 'Elderflower Spritz Floral', price: 4200, quantity: 3 },
        { id: 'item-oc-8', menuItemId: 'item-cafe-bravas', name: 'Papas Bravas de Papa Triple Cocción', price: 3500, quantity: 2 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(0, 20, 15),
      updatedAt: getVenueIsoDate(0, 20, 45),
      deliveredAt: getVenueIsoDate(0, 20, 45),
      paymentStatus: 'paid',
    },
    {
      id: 'ord-caf-act-1',
      establishmentId: 'cafe-speakeasy',
      tableId: 'tab-caf-1',
      tableName: 'Mesa A1',
      dinerName: 'Lucía B.',
      items: [
        { id: 'item-oc-9', menuItemId: 'item-cafe-negroni', name: 'Smoked Rosemary Negroni', price: 4500, quantity: 1 },
      ],
      status: 'Recibido',
      createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      paymentStatus: null,
    },
    {
      id: 'ord-caf-act-2',
      establishmentId: 'cafe-speakeasy',
      tableId: 'tab-caf-3',
      tableName: 'Mesa de Ventana',
      dinerName: 'Esteban C.',
      items: [
        { id: 'item-oc-10', menuItemId: 'item-cafe-flatwhite', name: 'Avocado Flat White', price: 2100, quantity: 1 },
        { id: 'item-oc-11', menuItemId: 'item-cafe-croissant', name: 'Croissant Hojaldrado de Pistachos', price: 2500, quantity: 1 },
      ],
      status: 'En preparación',
      createdAt: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      paymentStatus: null,
    },

    // --- AYER: Café Speakeasy ---
    {
      id: 'ord-caf-yest-1',
      establishmentId: 'cafe-speakeasy',
      tableId: 'tab-caf-1',
      tableName: 'Mesa A1',
      items: [
        { id: 'item-ocy-1', menuItemId: 'item-cafe-flatwhite', name: 'Avocado Flat White', price: 2100, quantity: 2 },
        { id: 'item-ocy-2', menuItemId: 'item-cafe-cinnamon', name: 'Roll de Canela y Pacanas', price: 2000, quantity: 2 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(-1, 10, 0),
      updatedAt: getVenueIsoDate(-1, 10, 20),
      deliveredAt: getVenueIsoDate(-1, 10, 20),
      paymentStatus: 'paid',
      cashCloseId: 'close-caf-cierre-ayer',
    },
    {
      id: 'ord-caf-yest-2',
      establishmentId: 'cafe-speakeasy',
      tableId: 'tab-caf-2',
      tableName: 'Mesa A2',
      items: [
        { id: 'item-ocy-3', menuItemId: 'item-cafe-spritz', name: 'Elderflower Spritz Floral', price: 4200, quantity: 2 },
        { id: 'item-ocy-4', menuItemId: 'item-cafe-tabla', name: 'Tabla Seleccionada de Charcutería', price: 7800, quantity: 1 },
      ],
      status: 'Entregado',
      createdAt: getVenueIsoDate(-1, 20, 0),
      updatedAt: getVenueIsoDate(-1, 20, 30),
      deliveredAt: getVenueIsoDate(-1, 20, 30),
      paymentStatus: 'paid',
      cashCloseId: 'close-caf-cierre-ayer',
    },
  ];

  return orders;
}

export function generateSeedTableCalls(): TableCall[] {
  return [
    {
      id: 'call-pal-1',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-1',
      tableName: 'Mesa 1',
      dinerName: 'Gonzalo G.',
      type: 'bill_request',
      status: 'pending',
      createdAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    },
    {
      id: 'call-pal-2',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-4',
      tableName: 'Mesa 4',
      dinerName: 'Mesa Amigos',
      type: 'waiter_call',
      status: 'pending',
      createdAt: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
    },
    {
      id: 'call-pal-3',
      establishmentId: 'bodegon-palermo',
      tableId: 'tab-pal-2',
      tableName: 'Mesa 2',
      dinerName: 'Sofía & Nicolás',
      type: 'waiter_call',
      status: 'attended',
      createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    },
    {
      id: 'call-caf-1',
      establishmentId: 'cafe-speakeasy',
      tableId: 'tab-caf-1',
      tableName: 'Mesa A1',
      dinerName: 'Lucía B.',
      type: 'waiter_call',
      status: 'pending',
      createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    },
  ];
}

export function generateSeedCashCloses(): CashClose[] {
  const allOrders = generateSeedOrders();
  const orderMap = new Map(allOrders.map((o) => [o.id, o]));

  function computeClose(orderIds: string[]): {
    totals: CashCloseTotals;
    topProducts: ProductLine[];
    byTable: TableLine[];
  } {
    const orders = orderIds
      .map((id) => orderMap.get(id))
      .filter((o): o is Order => o !== undefined);

    let totalRevenue = 0;
    const productMap = new Map<string, { name: string; units: number; revenue: number }>();
    const tableMap = new Map<string, { tableName: string; orderCount: number; revenue: number }>();

    for (const order of orders) {
      const orderRevenue = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
      totalRevenue += orderRevenue;

      for (const item of order.items) {
        const p = productMap.get(item.menuItemId);
        if (p) {
          p.units += item.quantity;
          p.revenue += item.price * item.quantity;
        } else {
          productMap.set(item.menuItemId, {
            name: item.name,
            units: item.quantity,
            revenue: item.price * item.quantity,
          });
        }
      }

      const t = tableMap.get(order.tableId);
      if (t) {
        t.orderCount += 1;
        t.revenue += orderRevenue;
      } else {
        tableMap.set(order.tableId, {
          tableName: order.tableName,
          orderCount: 1,
          revenue: orderRevenue,
        });
      }
    }

    const orderCount = orders.length;
    const averageTicket = orderCount === 0 ? 0 : totalRevenue / orderCount;

    const topProducts: ProductLine[] = [...productMap.entries()]
      .map(([menuItemId, p]) => ({ menuItemId, name: p.name, units: p.units, revenue: p.revenue }))
      .sort((a, b) => b.units - a.units);

    const byTable: TableLine[] = [...tableMap.entries()]
      .map(([tableId, t]) => ({ tableId, tableName: t.tableName, orderCount: t.orderCount, revenue: t.revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    return { totals: { orderCount, totalRevenue, averageTicket }, topProducts, byTable };
  }

  const closes: CashClose[] = [
    {
      id: 'close-pal-almuerzo-today',
      establishmentId: 'bodegon-palermo',
      closedByEmail: 'tomas@mimenu.com',
      closedByName: 'Tomás (Mozo)',
      closedByRole: 'waiter',
      periodStart: getVenueIsoDate(0, 12, 0),
      periodEnd: getVenueIsoDate(0, 15, 30),
      orderIds: ['ord-pal-today-1', 'ord-pal-today-2', 'ord-pal-today-3', 'ord-pal-today-4'],
      ...computeClose(['ord-pal-today-1', 'ord-pal-today-2', 'ord-pal-today-3', 'ord-pal-today-4']),
      note: 'Cierre de turno mediodía sin discrepancias en caja.',
      createdAt: getVenueIsoDate(0, 15, 30),
    },
    {
      id: 'close-pal-cierre-ayer',
      establishmentId: 'bodegon-palermo',
      closedByEmail: 'carolina@mimenu.com',
      closedByName: 'Carolina (Admin)',
      closedByRole: 'admin',
      periodStart: getVenueIsoDate(-1, 12, 0),
      periodEnd: getVenueIsoDate(-1, 23, 45),
      orderIds: ['ord-pal-yest-1', 'ord-pal-yest-2', 'ord-pal-yest-3', 'ord-pal-yest-4', 'ord-pal-yest-5', 'ord-pal-yest-6'],
      ...computeClose(['ord-pal-yest-1', 'ord-pal-yest-2', 'ord-pal-yest-3', 'ord-pal-yest-4', 'ord-pal-yest-5', 'ord-pal-yest-6']),
      note: 'Cierre nocturno general. Gran concurrencia en salón.',
      createdAt: getVenueIsoDate(-1, 23, 45),
    },
    {
      id: 'close-caf-matutino-today',
      establishmentId: 'cafe-speakeasy',
      closedByEmail: 'sofia@mimenu.com',
      closedByName: 'Sofía (Barista)',
      closedByRole: 'waiter',
      periodStart: getVenueIsoDate(0, 8, 30),
      periodEnd: getVenueIsoDate(0, 13, 0),
      orderIds: ['ord-caf-today-1', 'ord-caf-today-2'],
      ...computeClose(['ord-caf-today-1', 'ord-caf-today-2']),
      note: 'Turno mañana café de especialidad finalizado.',
      createdAt: getVenueIsoDate(0, 13, 0),
    },
    // D-1: close-caf-cierre-ayer (was missing — referenced by ord-caf-yest-1 and ord-caf-yest-2)
    {
      id: 'close-caf-cierre-ayer',
      establishmentId: 'cafe-speakeasy',
      closedByEmail: 'sofia@mimenu.com',
      closedByName: 'Sofía (Admin)',
      closedByRole: 'admin',
      periodStart: getVenueIsoDate(-1, 10, 0),
      periodEnd: getVenueIsoDate(-1, 21, 0),
      orderIds: ['ord-caf-yest-1', 'ord-caf-yest-2'],
      ...computeClose(['ord-caf-yest-1', 'ord-caf-yest-2']),
      createdAt: getVenueIsoDate(-1, 21, 0),
    },
    // D-1: close-pal-hist--N (days -2 to -7, were missing — referenced by flatMap of historical orders)
    ...[-2, -3, -4, -5, -6, -7].map((d): CashClose => {
      const orderIds = [
        `ord-pal-hist-${d}-1`,
        `ord-pal-hist-${d}-2`,
        `ord-pal-hist-${d}-3`,
      ];
      return {
        id: `close-pal-hist-${d}`,
        establishmentId: 'bodegon-palermo',
        closedByEmail: 'carolina@mimenu.com',
        closedByName: 'Carolina (Admin)',
        closedByRole: 'admin',
        periodStart: getVenueIsoDate(d, 13, 0),
        periodEnd: getVenueIsoDate(d, 22, 30),
        orderIds,
        ...computeClose(orderIds),
        createdAt: getVenueIsoDate(d, 22, 30),
      };
    }),
  ];

  return closes;
}

export function generateSeedCashRegisters(): CashRegisterSession[] {
  return [
    {
      id: 'bodegon-palermo',
      establishmentId: 'bodegon-palermo',
      isOpen: true,
      openedAt: getVenueIsoDate(0, 18, 30),
      openedByEmail: 'carolina@mimenu.com',
      openedByName: 'Carolina (Admin)',
      initialAmount: 15000,
      openNote: 'Fondo inicial de cambio verificado en billetes chicos',
    },
    {
      id: 'cafe-speakeasy',
      establishmentId: 'cafe-speakeasy',
      isOpen: true,
      openedAt: getVenueIsoDate(0, 15, 0),
      openedByEmail: 'sofia@mimenu.com',
      openedByName: 'Sofía (Admin)',
      initialAmount: 10000,
      openNote: 'Apertura de turno tarde con cambio',
    },
  ];
}

