import { Order } from '../types';

const fmt = (price: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(price);

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
};

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
};

const shortId = (id: string) => id.slice(-4).toUpperCase();

const THERMAL_CSS = `
  @page { size: 55mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 9pt;
    width: 49mm;
    margin: 2mm 2mm;
    color: #000;
    background: #fff;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .divider { border-top: 1px dashed #000; margin: 2mm 0; }
  .divider-solid { border-top: 1px solid #000; margin: 2mm 0; }
  .row { display: flex; justify-content: space-between; align-items: baseline; }
  .row-qty { display: flex; gap: 2mm; }
  .qty { min-width: 5mm; font-weight: bold; }
  .item-name { flex: 1; }
  .item-price { white-space: nowrap; }
  .comment { margin-left: 5mm; font-size: 8pt; font-style: italic; }
  .total-block { margin-top: 2mm; }
  .total-line { display: flex; justify-content: space-between; font-weight: bold; font-size: 10pt; }
  .footer { margin-top: 3mm; text-align: center; font-size: 8pt; }
  h1 { font-size: 11pt; text-align: center; text-transform: uppercase; letter-spacing: 1px; }
  h2 { font-size: 9pt; text-align: center; text-transform: uppercase; }
  .tag { font-size: 8pt; }
`;

function openPrint(html: string) {
  const win = window.open('', '_blank', 'width=280,height=700,toolbar=0,menubar=0,scrollbars=1,resizable=1');
  if (!win) {
    alert('El navegador bloqueó la ventana emergente de impresión. Permita las ventanas emergentes para este sitio.');
    return;
  }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Impresión</title><style>${THERMAL_CSS}</style></head><body>${html}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    setTimeout(() => win.close(), 1000);
  }, 400);
}

export function printKitchenTicket(order: Order) {
  const itemsHtml = order.items.map(i => `
    <div class="row-qty">
      <span class="qty">${i.quantity}x</span>
      <span class="item-name bold">${i.name}</span>
    </div>
    ${i.comment ? `<div class="comment">→ ${i.comment}</div>` : ''}
  `).join('');

  const html = `
    <h1>COMANDA</h1>
    <div class="center tag">#${shortId(order.id)} · ${fmtTime(order.createdAt)}</div>
    <div class="divider-solid"></div>
    <div class="row">
      <span class="bold">${order.tableName}</span>
      ${order.dinerName ? `<span class="tag">${order.dinerName}</span>` : ''}
    </div>
    <div class="divider"></div>
    ${itemsHtml}
    <div class="divider-solid"></div>
    <div class="footer tag">— Cocina —</div>
  `;
  openPrint(html);
}

export function printTableBill(tableName: string, orders: Order[], estName: string) {
  const sessionOrders = orders.filter(o => o.status !== 'Cancelado');
  const grandTotal = sessionOrders.reduce(
    (sum, o) => sum + o.items.reduce((s, i) => s + i.price * i.quantity, 0), 0
  );

  const dinerNames = [...new Set(sessionOrders.map(o => o.dinerName).filter(Boolean))];

  const ordersHtml = sessionOrders.map(o => {
    const orderTotal = o.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const itemsHtml = o.items.map(i => `
      <div class="row">
        <span class="item-name">${i.quantity}x ${i.name}</span>
        <span class="item-price">${fmt(i.price * i.quantity)}</span>
      </div>
      ${i.comment ? `<div class="comment">→ ${i.comment}</div>` : ''}
    `).join('');

    return `
      <div class="tag center">#${shortId(o.id)} · ${fmtTime(o.createdAt)}</div>
      ${itemsHtml}
      <div class="row right" style="margin-top:1mm; font-size:8pt;">
        <span></span><span>Subtotal: ${fmt(orderTotal)}</span>
      </div>
      <div class="divider"></div>
    `;
  }).join('');

  const html = `
    <h1>${estName || 'Mi Menú'}</h1>
    <div class="divider-solid"></div>
    <div class="row"><span class="bold">Mesa:</span><span>${tableName}</span></div>
    ${dinerNames.length > 0 ? `<div class="row"><span class="bold">Cliente:</span><span>${dinerNames.join(', ')}</span></div>` : ''}
    <div class="tag">${fmtDateTime(new Date().toISOString())}</div>
    <div class="divider-solid"></div>
    ${ordersHtml}
    <div class="total-block">
      <div class="total-line">
        <span>TOTAL</span>
        <span>${fmt(grandTotal)}</span>
      </div>
    </div>
    <div class="footer">
      ¡Gracias por su visita!<br>Vuelva pronto
    </div>
  `;
  openPrint(html);
}
