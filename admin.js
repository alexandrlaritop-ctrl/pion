/*
 * Пион — демо-админка: вход, товары, заказы и их статусы.
 * Данные лежат в этом браузере (PionStore). В настоящей версии те же действия пойдут на сервер.
 */
(() => {
  'use strict';

  const S = window.PionStore;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const money = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₽`;

  if (!S || !S.storageWorks()) {
    $('[data-nostore]').hidden = false;
    return;
  }

  const STATUS = Object.fromEntries(S.STATUSES.map((s) => [s.id, s]));
  const ACTIVE = new Set(['new', 'wrote', 'waiting']); // эти статусы ждут действий
  const STALE_MS = 2 * 60 * 60 * 1000; // «без движения» — дольше 2 часов
  const CHANNELS = { max: 'MAX', telegram: 'Telegram', whatsapp: 'WhatsApp', sms: 'SMS', copy: 'скопировал текст' };

  const loginView = $('[data-view="login"]');
  const appView = $('[data-view="app"]');
  const toastBox = $('[data-toast]');

  /* ---------- время ---------- */
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const hhmm = (d) => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  function fmtTime(ts) {
    const d = new Date(ts);
    const days = Math.round((dayStart(new Date()) - dayStart(d)) / 86400000);
    if (days === 0) return `сегодня, ${hhmm(d)}`;
    if (days === 1) return `вчера, ${hhmm(d)}`;
    return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}, ${hhmm(d)}`;
  }
  function fmtShort(ts) {
    const d = new Date(ts);
    if (dayStart(d) === dayStart(new Date())) return hhmm(d);
    return `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${hhmm(d)}`;
  }
  function ago(ms) {
    const m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return `${m} мин`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} ч`;
    return `${Math.floor(h / 24)} дн`;
  }

  let toastTimer = 0;
  function toast(message) {
    toastBox.textContent = message;
    toastBox.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastBox.classList.remove('is-on'), 3200);
  }

  /* ---------- подтверждение ---------- */
  const confirmEl = $('[data-confirm]');
  function confirmBox(text, yesLabel = 'Удалить') {
    return new Promise((resolve) => {
      const prev = document.activeElement;
      $('[data-confirm-text]', confirmEl).textContent = text;
      const yes = $('[data-confirm-yes]', confirmEl);
      yes.textContent = yesLabel;
      confirmEl.hidden = false;
      yes.focus();
      const done = (value) => {
        confirmEl.hidden = true;
        confirmEl.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey, true);
        prev?.focus?.();
        resolve(value);
      };
      const onClick = (e) => {
        if (e.target.closest('[data-confirm-yes]')) done(true);
        else if (e.target.closest('[data-confirm-no]')) done(false);
      };
      const onKey = (e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        done(false);
      };
      confirmEl.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey, true);
    });
  }

  /* ---------- вход ---------- */
  const loginForm = $('[data-login]');
  function showApp() {
    loginView.hidden = true;
    appView.hidden = false;
    showTab(location.hash === '#products' ? 'products' : 'orders');
    renderOrders();
    renderProducts();
  }
  function showLogin() {
    appView.hidden = true;
    loginView.hidden = false;
    loginForm.elements.password.value = '';
    loginForm.elements.password.focus();
  }
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const ok = S.login(loginForm.elements.password.value);
    $('[data-login-error]').hidden = ok;
    if (ok) showApp();
    else loginForm.elements.password.select();
  });
  $('[data-logout]').addEventListener('click', () => {
    S.logout();
    showLogin();
  });

  /* ---------- вкладки ---------- */
  const tabs = $$('[data-tab]');
  const panels = $$('[data-panel]');
  function showTab(name) {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    panels.forEach((p) => { p.hidden = p.dataset.panel !== name; });
    try {
      history.replaceState(null, '', `#${name}`);
    } catch {
      // страница открыта с диска — адрес не меняем
    }
  }
  tabs.forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  /* ---------- заказы ---------- */
  const ordersBox = $('[data-orders]');
  const filtersBox = $('[data-order-filters]');
  const attention = $('[data-attention]');
  const newCount = $('[data-new-count]');
  let orderFilter = 'all';
  let knownIds = new Set();

  const isStale = (o, now) => ACTIVE.has(o.status) && now - (o.statusAt || o.createdAt) > STALE_MS;
  function sumText(items) {
    if (!items.length) return '—';
    const priced = items.filter((i) => i.price);
    const total = priced.reduce((s, i) => s + i.price * i.qty, 0);
    if (priced.length === items.length) return money(total);
    return priced.length ? `${money(total)} + по запросу` : 'по запросу';
  }
  function orderHtml(o, now) {
    const st = STATUS[o.status] || STATUS.new;
    const stale = isStale(o, now);
    const items = Array.isArray(o.items) ? o.items : [];
    const itemsHtml = items.length
      ? items.map((i) => `<li><span>${esc(i.name)}${i.qty > 1 ? ` × ${i.qty}` : ''}</span><b>${i.price ? money(i.price * i.qty) : 'по запросу'}</b></li>`).join('')
      : '<li><span>Без выбора — опишет в чате</span></li>';
    const options = S.STATUSES.map((s) => `<option value="${s.id}"${s.id === st.id ? ' selected' : ''}>${s.label}</option>`).join('');
    const history = (o.history || []).map((h) => `${(STATUS[h.status] || st).label} ${fmtShort(h.at)}`).join(' → ');
    return `<article class="ocard ocard--${st.id}${stale ? ' is-stale' : ''}" data-order="${o.id}">
      <header class="ocard__head">
        <div><b class="ocard__num">№ ${o.id}</b>${o.sample ? '<span class="ocard__sample">пример</span>' : ''}<span class="ocard__time">${fmtTime(o.createdAt)}</span></div>
        <label class="status status--${st.id}"><span class="sr-only">Статус заказа № ${o.id}</span><select data-status="${o.id}">${options}</select></label>
      </header>
      ${stale ? `<p class="ocard__alert"><svg class="ico" aria-hidden="true"><use href="#i-clock"/></svg>Без движения ${ago(now - (o.statusAt || o.createdAt))} — не забудьте ответить</p>` : ''}
      <ul class="ocard__items">${itemsHtml}</ul>
      <dl class="ocard__meta">
        <div><dt>Сумма</dt><dd>${sumText(items)}</dd></div>
        <div><dt>Когда нужен</dt><dd>${esc(o.when || 'не указали')}</dd></div>
        <div><dt>Получение</dt><dd>${esc(o.way || '—')}</dd></div>
        <div><dt>Куда написал</dt><dd>${esc(CHANNELS[o.channel] || '—')}</dd></div>
      </dl>
      <label class="ocard__note"><span>Заметка</span><textarea class="input input--area" rows="2" maxlength="500" data-note="${o.id}" placeholder="Например: договорились на субботу, ждём адрес">${esc(o.note || '')}</textarea></label>
      <footer class="ocard__foot"><span>${esc(history)}</span><button class="link-btn link-btn--danger" type="button" data-del-order="${o.id}">Удалить</button></footer>
    </article>`;
  }
  function emptyOrders(total) {
    if (total) return '<p class="aempty">Здесь заказов нет.</p>';
    return '<div class="aempty"><p>Заказов пока нет. Откройте сайт, добавьте букет в&nbsp;заказ и&nbsp;нажмите MAX, Telegram или «Скопировать»&nbsp;— заказ появится здесь с&nbsp;номером.</p>'
      + '<a class="btn btn--action btn--sm" href="index.html#catalog">Открыть каталог</a> <button class="btn btn--line btn--sm" type="button" data-samples>Добавить примеры заказов</button></div>';
  }
  function renderOrders() {
    const orders = S.getOrders().sort((a, b) => b.createdAt - a.createdAt);
    const now = Date.now();
    const counts = { all: orders.length, attention: orders.filter((o) => isStale(o, now)).length };
    S.STATUSES.forEach((s) => { counts[s.id] = orders.filter((o) => o.status === s.id).length; });
    const filters = [['all', 'Все'], ['attention', 'Требуют внимания'], ...S.STATUSES.map((s) => [s.id, s.label])];
    filtersBox.innerHTML = filters
      .filter(([id]) => id === 'all' || counts[id] || orderFilter === id)
      .map(([id, label]) => `<button class="chip" type="button" data-ofilter="${id}" aria-pressed="${orderFilter === id}">${label}<span class="chip__n">${counts[id]}</span></button>`)
      .join('');
    attention.hidden = !counts.attention;
    attention.innerHTML = `<svg class="ico" aria-hidden="true"><use href="#i-clock"/></svg>Без движения больше 2 часов: ${counts.attention} — не забудьте ответить`;
    const shown = orders.filter((o) => orderFilter === 'all' || (orderFilter === 'attention' ? isStale(o, now) : o.status === orderFilter));
    ordersBox.innerHTML = shown.length ? shown.map((o) => orderHtml(o, now)).join('') : emptyOrders(orders.length);
    newCount.hidden = !counts.new;
    newCount.textContent = String(counts.new);
    document.title = `${counts.new ? `(${counts.new}) ` : ''}Админка — «Пион» (демо)`;
    knownIds = new Set(orders.map((o) => o.id));
  }

  filtersBox.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ofilter]');
    if (!b) return;
    orderFilter = b.dataset.ofilter;
    renderOrders();
  });
  ordersBox.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-status]');
    if (!sel) return;
    const id = Number(sel.dataset.status);
    S.updateOrder(id, { status: sel.value });
    renderOrders();
    $(`[data-status="${id}"]`, ordersBox)?.focus();
    toast(`Заказ № ${id}: ${STATUS[sel.value].label}`);
  });
  let noteTimer = 0;
  const saveNote = (t) => S.updateOrder(Number(t.dataset.note), { note: t.value.slice(0, 500) });
  ordersBox.addEventListener('input', (e) => {
    const t = e.target.closest('[data-note]');
    if (!t) return;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => saveNote(t), 400);
  });
  ordersBox.addEventListener('focusout', (e) => {
    const t = e.target.closest('[data-note]');
    if (!t) return;
    clearTimeout(noteTimer);
    saveNote(t);
  });
  ordersBox.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del-order]');
    if (!del) return;
    const id = Number(del.dataset.delOrder);
    if (!(await confirmBox(`Удалить заказ № ${id}? Вернуть его будет нельзя.`))) return;
    S.deleteOrder(id);
    renderOrders();
    toast(`Заказ № ${id} удалён`);
  });

  // Примеры заказов — чтобы показать статусы и подсветку «без движения» без ожидания.
  function addSamples() {
    const H = 3600000;
    const now = Date.now();
    const byId = Object.fromEntries(S.getProducts().concat(S.DEFAULT_PRODUCTS).reverse().map((p) => [p.id, p]));
    const item = (id, qty = 1) => ({ id, name: byId[id].name, qty, price: byId[id].price || null });
    const day = (n) => new Date(now + n * 86400000).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
    const samples = [
      { items: [item('orchids')], when: '', way: 'доставка', channel: 'telegram', status: 'declined', created: 50 * H, moved: 48 * H, note: 'Передумали' },
      { items: [item('box')], when: `${day(2)}, к 12:00`, way: 'самовывоз', channel: 'max', status: 'accepted', created: 26 * H, moved: 20 * H, note: 'Заберут в 12:00' },
      { items: [item('gift')], when: `${day(1)}, к 12:00`, way: 'доставка', channel: 'whatsapp', status: 'waiting', created: 6 * H, moved: 5 * H, note: 'Ждём адрес доставки' },
      { items: [item('mint', 2)], when: `${day(1)}, к 15:00`, way: 'самовывоз', channel: 'telegram', status: 'wrote', created: 4 * H, moved: 3 * H, note: 'Спросили про открытку — ответить' },
      { items: [item('basket')], when: `${day(0)}, к 18:00`, way: 'доставка', channel: 'max', status: 'new', created: 12 * 60000, moved: 12 * 60000, note: '' },
    ];
    for (const s of samples) {
      const o = S.createOrder({ items: s.items, when: s.when, way: s.way, channel: s.channel, note: s.note, sample: true }, now - s.created);
      if (o && s.status !== 'new') S.updateOrder(o.id, { status: s.status }, now - s.moved);
    }
    orderFilter = 'all';
    showTab('orders');
    renderOrders();
    toast('Добавили 5 примеров заказов');
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-samples]')) addSamples();
  });

  /* ---------- товары ---------- */
  const productsBox = $('[data-products]');
  function productRow(p, i, n) {
    return `<article class="prow${p.hidden ? ' is-hidden' : ''}" data-product="${esc(p.id)}">
      <span class="prow__img"><img src="${esc(p.img)}" alt="" loading="lazy"></span>
      <div class="prow__info">
        <b class="prow__name">${esc(p.name)}</b>
        <span class="prow__meta">${esc(S.CATS[p.cat] || '')} · ${p.price ? money(p.price) : 'цена по запросу'}${p.hidden ? ' · <em>скрыт с сайта</em>' : ''}</span>
        ${p.desc ? `<span class="prow__desc">${esc(p.desc)}</span>` : ''}
      </div>
      <div class="prow__actions">
        <span class="prow__move">
          <button class="icon-btn" type="button" data-move="-1" aria-label="Поднять выше"${i === 0 ? ' disabled' : ''}><svg class="ico" aria-hidden="true"><use href="#i-up"/></svg></button>
          <button class="icon-btn" type="button" data-move="1" aria-label="Опустить ниже"${i === n - 1 ? ' disabled' : ''}><svg class="ico" aria-hidden="true"><use href="#i-down"/></svg></button>
        </span>
        <button class="btn btn--line btn--sm" type="button" data-toggle>${p.hidden ? 'Показать' : 'Скрыть'}</button>
        <button class="btn btn--action btn--sm" type="button" data-edit>Изменить</button>
        <button class="icon-btn icon-btn--danger" type="button" data-delete aria-label="Удалить «${esc(p.name)}»"><svg class="ico" aria-hidden="true"><use href="#i-trash"/></svg></button>
      </div>
    </article>`;
  }
  function renderProducts() {
    const list = S.getProducts();
    productsBox.innerHTML = list.length ? list.map((p, i) => productRow(p, i, list.length)).join('') : '<p class="aempty">Товаров нет. Нажмите «Добавить товар».</p>';
  }
  function saveList(list) {
    if (S.saveProducts(list)) return true;
    toast('Не получилось сохранить: в браузере не хватает места');
    return false;
  }
  productsBox.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    const row = e.target.closest('[data-product]');
    if (!btn || !row) return;
    const id = row.dataset.product;
    const list = S.getProducts();
    const i = list.findIndex((p) => p.id === id);
    if (i < 0) return;
    if (btn.dataset.move) {
      const j = i + Number(btn.dataset.move);
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      if (!saveList(list)) return;
      renderProducts();
      const again = $(`[data-product="${CSS.escape(id)}"] [data-move="${btn.dataset.move}"]`, productsBox);
      (again && !again.disabled ? again : $(`[data-product="${CSS.escape(id)}"] [data-edit]`, productsBox))?.focus();
    } else if ('toggle' in btn.dataset) {
      list[i].hidden = !list[i].hidden;
      if (!saveList(list)) return;
      renderProducts();
      $(`[data-product="${CSS.escape(id)}"] [data-toggle]`, productsBox)?.focus();
      toast(list[i].hidden ? `«${list[i].name}» скрыт с сайта` : `«${list[i].name}» снова на сайте`);
    } else if ('edit' in btn.dataset) {
      openEditor(id);
    } else if ('delete' in btn.dataset) {
      if (!(await confirmBox(`Удалить «${list[i].name}»? Товар пропадёт с сайта.`))) return;
      list.splice(i, 1);
      if (!saveList(list)) return;
      renderProducts();
      toast('Товар удалён');
    }
  });
  $('[data-reset]').addEventListener('click', async () => {
    if (!(await confirmBox('Вернуть товары как было в начале? Ваши изменения и добавленные товары пропадут.', 'Вернуть'))) return;
    S.resetProducts();
    renderProducts();
    toast('Товары вернули как было');
  });

  /* ---------- карточка товара ---------- */
  const editor = $('[data-editor]');
  const form = $('[data-editor-form]');
  const F = form.elements;
  const preview = $('[data-photo-preview]');
  const photoEmpty = $('[data-photo-empty]');
  const formError = $('[data-form-error]');
  let editingId = null;
  let photo = null;
  let editorOpener = null;

  function setPhoto(src) {
    photo = src;
    preview.hidden = !src;
    photoEmpty.hidden = !!src;
    if (src) preview.src = src;
    else preview.removeAttribute('src');
  }
  function fail(message) {
    formError.textContent = message;
    formError.hidden = false;
  }
  function openEditor(id) {
    const p = id ? S.getProducts().find((x) => x.id === id) : null;
    editingId = p ? p.id : null;
    editorOpener = document.activeElement;
    form.reset();
    formError.hidden = true;
    $('#editor-title').textContent = p ? 'Изменить товар' : 'Новый товар';
    F.pname.value = p ? p.name : '';
    F.pdesc.value = p ? p.desc : '';
    F.pprice.value = p && p.price ? String(p.price) : '';
    F.pcat.value = p ? p.cat : 'bouquet';
    F.ptag.value = p ? p.tag : '';
    F.pvisible.checked = p ? !p.hidden : true;
    setPhoto(p ? p.img : null);
    editor.hidden = false;
    document.documentElement.classList.add('is-locked');
    F.pname.focus();
  }
  function closeEditor() {
    if (editor.hidden) return;
    editor.hidden = true;
    document.documentElement.classList.remove('is-locked');
    editorOpener?.focus?.();
  }
  $$('[data-close-modal]', editor).forEach((b) => b.addEventListener('click', closeEditor));
  $('[data-add-product]').addEventListener('click', () => openEditor(null));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !editor.hidden && confirmEl.hidden) closeEditor();
  });

  // Фото с телефона или компьютера: обрезаем под карточку 4:5 и уменьшаем до 640×800.
  async function toCardImage(file) {
    let src = null;
    if ('createImageBitmap' in window) {
      try {
        src = await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch {
        src = null;
      }
    }
    if (!src) {
      src = await new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('не картинка')); };
        img.src = url;
      });
    }
    const W = 640;
    const H = 800;
    const sw = src.width;
    const sh = src.height;
    const scale = Math.max(W / sw, H / sh);
    const cw = W / scale;
    const ch = H / scale;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, W, H);
    if (src.close) src.close();
    return canvas.toDataURL('image/jpeg', 0.8);
  }
  $('[data-photo-input]').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      fail('Это не картинка — выберите фото');
      return;
    }
    try {
      setPhoto(await toCardImage(file));
      formError.hidden = true;
    } catch {
      fail('Не получилось открыть фото — попробуйте другое');
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = F.pname.value.trim().replace(/\s+/g, ' ');
    const desc = F.pdesc.value.trim().replace(/\s+/g, ' ');
    const priceRaw = F.pprice.value.replace(/руб\.?|₽|\s| /gi, '');
    if (!name) {
      fail('Напишите название');
      F.pname.focus();
      return;
    }
    let price = null;
    if (priceRaw) {
      price = /^\d+$/.test(priceRaw) ? Number(priceRaw) : NaN;
      if (!Number.isInteger(price) || price <= 0 || price > 1000000) {
        fail('Цена — целое число рублей, например 3400. Или оставьте пустым — на сайте будет «цена по запросу».');
        F.pprice.focus();
        return;
      }
    }
    if (!photo) {
      fail('Добавьте фото');
      return;
    }
    const data = { name, desc, price, cat: F.pcat.value, tag: F.ptag.value.trim(), img: photo, hidden: !F.pvisible.checked, alt: desc ? `${name}: ${desc}` : name };
    const list = S.getProducts();
    const wasNew = !editingId;
    if (editingId) {
      const p = list.find((x) => x.id === editingId);
      if (p) Object.assign(p, data);
    } else {
      list.unshift({ id: `p${Date.now().toString(36)}`, ...data });
    }
    if (!S.saveProducts(list)) {
      fail('Не хватило места в браузере для фото. Удалите лишние товары или выберите фото поменьше.');
      return;
    }
    closeEditor();
    renderProducts();
    toast(wasNew ? 'Товар добавлен — он уже в каталоге на сайте' : 'Изменения сохранены — на сайте уже новые');
  });

  /* ---------- сайт открыт в соседней вкладке ---------- */
  addEventListener('storage', (e) => {
    if (appView.hidden) return;
    if (e.key === null || e.key === S.KEYS.orders) {
      const before = knownIds;
      if (!document.activeElement?.closest?.('[data-note]')) renderOrders();
      const fresh = S.getOrders().filter((o) => !before.has(o.id));
      if (fresh.length) toast(`Новый заказ № ${fresh[0].id} с сайта`);
    }
    if (e.key === null || e.key === S.KEYS.products) renderProducts();
  });
  // раз в минуту обновляем «без движения», если человек сейчас ничего не пишет
  setInterval(() => {
    if (!appView.hidden && !document.activeElement?.closest?.('[data-note], select')) renderOrders();
  }, 60000);

  if (S.isLoggedIn()) showApp();
  else showLogin();
})();
