import { Establishment, Category, MenuItem, Table } from '../types';

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
    available: false, // Default deactivated to test the agotado visual on start of cafe!
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
  { id: 'tab-pal-out', establishmentId: 'bodegon-palermo', name: 'Mesa Exterior 9', active: false }, // Inactiva para tests!

  // Café & Co. Speakeasy
  { id: 'tab-caf-1', establishmentId: 'cafe-speakeasy', name: 'Mesa A1', active: true },
  { id: 'tab-caf-2', establishmentId: 'cafe-speakeasy', name: 'Mesa A2', active: true },
  { id: 'tab-caf-3', establishmentId: 'cafe-speakeasy', name: 'Mesa de Ventana', active: true },
  { id: 'tab-caf-4', establishmentId: 'cafe-speakeasy', name: 'Sillón Comedor', active: true },
];
