/*
 * Пион — данные демо-версии: товары и заказы.
 * Демо хранит всё в браузере (localStorage), поэтому сайт и админка видят одни данные
 * только в одном и том же браузере. В настоящей версии те же функции будут ходить на сервер.
 */
(function () {
  'use strict';

  var PREFIX = 'pion-demo:';
  var KEYS = { products: PREFIX + 'products', orders: PREFIX + 'orders', seq: PREFIX + 'seq', auth: PREFIX + 'auth' };

  var CATS = { bouquet: 'Букеты', box: 'Корзины и коробки', gift: 'Подарки' };

  var STATUSES = [
    { id: 'new', label: 'Новый' },
    { id: 'wrote', label: 'Написал' },
    { id: 'waiting', label: 'Ждёт ответа' },
    { id: 'accepted', label: 'Принят' },
    { id: 'done', label: 'Выполнен' },
    { id: 'declined', label: 'Отказ' },
  ];

  var DEFAULT_PRODUCTS = [
    { id: 'basket', name: 'Корзина с цветами', desc: 'Хризантемы, гвоздики, кустовые розы и альстромерии', alt: 'Корзина: белые хризантемы, розовые гвоздики, кустовые розы и альстромерии', price: null, cat: 'box', tag: 'Корзина', img: 'img/p-basket.jpg', hidden: false },
    { id: 'box', name: 'Композиция в коробке', desc: 'Розы, хризантемы и сирень', alt: 'Композиция в коробке: розы, белые хризантемы и сирень', price: null, cat: 'box', tag: 'В коробке', img: 'img/p-box.jpg', hidden: false },
    { id: 'orchids', name: 'Хризантемы с орхидеями', desc: 'Белые хризантемы и три орхидеи', alt: 'Букет: белые хризантемы и три орхидеи', price: null, cat: 'bouquet', tag: '', img: 'img/p-orchids.jpg', hidden: false },
    { id: 'peach', name: 'Хризантемы с гвоздиками', desc: 'Белые хризантемы и персиковые гвоздики', alt: 'Букет: белые хризантемы и персиковые гвоздики', price: null, cat: 'bouquet', tag: '', img: 'img/p-peach.jpg', hidden: false },
    { id: 'roses', name: 'Букет с пудровыми розами', desc: 'Розы, гипсофила и зелень', alt: 'Букет: пудровые розы, гипсофила и зелень в персиковой упаковке', price: null, cat: 'bouquet', tag: '', img: 'img/p-roses.jpg', hidden: false },
    { id: 'mint', name: 'Букет из хризантем', desc: 'Белые хризантемы и нежные сезонные цветы', alt: 'Букет: белые хризантемы и нежно-розовые цветы в мятной упаковке', price: 3400, cat: 'bouquet', tag: '', img: 'img/p-mint.jpg', hidden: false },
    { id: 'yellow', name: 'Солнечный букет', desc: 'Жёлтые и белые кустовые хризантемы', alt: 'Букет: жёлтые и белые кустовые хризантемы', price: null, cat: 'bouquet', tag: '', img: 'img/p-yellow.jpg', hidden: false },
    { id: 'gift', name: 'Розы и мишка', desc: 'Красные розы и плюшевый мишка в подарочной сумке', alt: 'Подарок: красные розы и плюшевый мишка в подарочной сумке', price: null, cat: 'gift', tag: 'Подарок', img: 'img/p-gift.jpg', hidden: false },
  ];

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  // false — браузер не дал сохранить (нет места или хранилище запрещено)
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  // Картинка — только своя: путь img/… или фото, уменьшенное в админке (data:image/…).
  function safeImg(src) {
    return typeof src === 'string' && (/^img\/[\w.-]+$/.test(src) || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src));
  }
  function cleanProduct(p) {
    if (!p || typeof p.id !== 'string' || typeof p.name !== 'string' || !p.name.trim() || !safeImg(p.img)) return null;
    var price = Number(p.price);
    return {
      id: p.id.slice(0, 40),
      name: p.name.slice(0, 80),
      desc: typeof p.desc === 'string' ? p.desc.slice(0, 200) : '',
      alt: typeof p.alt === 'string' ? p.alt.slice(0, 240) : p.name,
      price: Number.isFinite(price) && price > 0 ? Math.round(price) : null,
      cat: CATS[p.cat] ? p.cat : 'bouquet',
      tag: typeof p.tag === 'string' ? p.tag.slice(0, 24) : '',
      img: p.img,
      hidden: !!p.hidden,
    };
  }

  function getProducts() {
    var list = read(KEYS.products, null);
    if (!Array.isArray(list)) return clone(DEFAULT_PRODUCTS);
    return list.map(cleanProduct).filter(Boolean);
  }
  function saveProducts(list) { return write(KEYS.products, list.map(cleanProduct).filter(Boolean)); }
  function resetProducts() {
    try { localStorage.removeItem(KEYS.products); } catch (e) { /* ничего */ }
  }

  function getOrders() {
    var list = read(KEYS.orders, []);
    return Array.isArray(list) ? list.filter(function (o) { return o && typeof o.id === 'number'; }) : [];
  }
  function saveOrders(list) { return write(KEYS.orders, list); }
  function peekNextOrderId() {
    var last = Number(read(KEYS.seq, 1000)) || 1000;
    var max = getOrders().reduce(function (m, o) { return Math.max(m, o.id); }, 0);
    return Math.max(last, max) + 1;
  }
  // Новый заказ: номер по порядку, статус «Новый». at — время (для примеров в админке).
  function createOrder(data, at) {
    var now = at || Date.now();
    var order = Object.assign({}, data, { id: peekNextOrderId(), createdAt: now, status: 'new', statusAt: now, note: data.note || '', history: [{ at: now, status: 'new' }] });
    var list = getOrders();
    list.unshift(order);
    if (!saveOrders(list)) return null;
    write(KEYS.seq, order.id);
    return order;
  }
  function updateOrder(id, patch, at) {
    var list = getOrders();
    var order = list.find(function (o) { return o.id === id; });
    if (!order) return null;
    var now = at || Date.now();
    if (patch.status && patch.status !== order.status) {
      order.history = (order.history || []).concat([{ at: now, status: patch.status }]);
      order.statusAt = now;
    }
    Object.assign(order, patch);
    saveOrders(list);
    return order;
  }
  function deleteOrder(id) { saveOrders(getOrders().filter(function (o) { return o.id !== id; })); }

  // Вход в демо-админку: помним 7 дней в этом браузере.
  var DEMO_PASSWORD = 'pion';
  function login(password) {
    if (String(password).trim().toLowerCase() !== DEMO_PASSWORD) return false;
    write(KEYS.auth, Date.now() + 7 * 24 * 3600 * 1000);
    return true;
  }
  function isLoggedIn() { return Number(read(KEYS.auth, 0)) > Date.now(); }
  function logout() {
    try { localStorage.removeItem(KEYS.auth); } catch (e) { /* ничего */ }
  }
  function storageWorks() {
    try {
      localStorage.setItem(PREFIX + 'test', '1');
      localStorage.removeItem(PREFIX + 'test');
      return true;
    } catch (e) {
      return false;
    }
  }

  window.PionStore = {
    KEYS: KEYS,
    CATS: CATS,
    STATUSES: STATUSES,
    DEFAULT_PRODUCTS: DEFAULT_PRODUCTS,
    getProducts: getProducts,
    saveProducts: saveProducts,
    resetProducts: resetProducts,
    getOrders: getOrders,
    peekNextOrderId: peekNextOrderId,
    createOrder: createOrder,
    updateOrder: updateOrder,
    deleteOrder: deleteOrder,
    login: login,
    isLoggedIn: isLoggedIn,
    logout: logout,
    storageWorks: storageWorks,
  };
})();
