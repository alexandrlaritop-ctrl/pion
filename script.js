/*
 * Пион — демо-версия сайта.
 * Букеты и цветы поштучно берутся из PionStore (их меняет демо-админка, данные — в этом браузере).
 * В каталогах по 10 штук на странице. Дни и часы, закрытые в админке, выбрать нельзя.
 * Заказ получает номер, сохраняется для админки и открывается в мессенджере покупателя.
 * Имя и телефон сайт не спрашивает — покупатель пишет их в чате.
 */
(() => {
  'use strict';

  // Контакты магазина. Пустые поля заполним, когда магазин пришлёт данные.
  const SHOP = {
    phone: '+79609685122',
    telegram: '', // ник в Telegram без @ — тогда текст заказа подставится в чат сам
    whatsapp: '79609685122', // номер, если на нём есть WhatsApp
    max: '', // ссылка на чат магазина в MAX
  };
  const store = window.PionStore || null;
  const PAGE = 10; // товаров на одной странице каталога

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const touch = matchMedia('(pointer: coarse)');
  const money = (n, space = ' ') => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, space) + space + '₽';
  const plural = (n, [one, few, many]) => {
    const a = n % 10;
    const b = n % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
    return many;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // короткие слова не остаются в конце строки
  const SHORT = /(^|[\s(«])(в|во|и|с|со|к|ко|о|об|у|на|по|из|за|от|до|не|ни|а|но|для|без|под|над)\s+/gi;
  const nbsp = (s) => String(s).replace(SHORT, (m, pre, w) => `${pre}${w} `);

  /* ---------- расцветка (сайт в бордо; ?theme=beige|sage оставлены для сравнения) ---------- */
  const THEMES = { bordo: '#1a0710', beige: '#f2e8db', sage: '#15211b' };
  $('meta[name="theme-color"]')?.setAttribute('content', THEMES[document.documentElement.getAttribute('data-theme')] || THEMES.bordo);

  /* ---------- шапка и меню ---------- */
  const header = $('.header');
  const burger = $('.burger');
  const setMenu = (open) => {
    header.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
  };
  burger.addEventListener('click', () => setMenu(!header.classList.contains('is-open')));
  $$('.nav a').forEach((a) => a.addEventListener('click', () => setMenu(false)));

  const navLinks = new Map($$('.nav a').map((a) => [a.hash.slice(1), a]));
  const spy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      navLinks.forEach((a) => a.classList.remove('is-active'));
      navLinks.get(e.target.id)?.classList.add('is-active');
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  navLinks.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) spy.observe(section);
  });

  /* ---------- появление блоков ---------- */
  const reveal = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      reveal.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -6% 0px' });
  const observeReveal = (root = document) => $$('.reveal:not(.is-in)', root).forEach((el) => reveal.observe(el));
  observeReveal();

  /* ---------- параллакс ---------- */
  // data-depth: слой сдвигается медленнее (>0) или быстрее (<0) страницы.
  // data-scene="top": первый экран, считаем от начала страницы; остальные — от центра окна.
  // data-window: фото в карточке плывёт внутри рамки.
  let raf = 0;
  let mx = 0;
  let my = 0;
  let tx = 0;
  let ty = 0;
  const request = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const watch = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.target.parallax) e.target.parallax.on = e.isIntersecting;
    request();
  }, { rootMargin: '30% 0px' });

  const scenes = $$('[data-scene]').map((box) => ({
    box,
    top: box.dataset.scene === 'top',
    on: true,
    layers: $$('[data-depth]', box).map((el) => ({
      el,
      depth: Number(el.dataset.depth),
      rot: Number(el.dataset.rot || 0),
      tilt: Number(el.dataset.tilt || 0),
      fade: el.hasAttribute('data-fade'),
    })),
  }));
  scenes.forEach((s) => {
    s.box.parallax = s;
    watch.observe(s.box);
  });
  let windows = [];
  function collectWindows() {
    windows.forEach((w) => watch.unobserve(w.box));
    windows = $$('[data-window]').map((box) => ({ box, img: $('img', box), k: Number(box.dataset.window) || 0.07, on: true }));
    windows.forEach((w) => {
      w.box.parallax = w;
      watch.observe(w.box);
    });
    request();
  }

  function frame() {
    raf = 0;
    const vh = innerHeight;
    const motion = !reduceMotion.matches;
    const k = innerWidth < 768 ? 0.55 : 1;
    header.classList.toggle('is-scrolled', scrollY > 8);
    if (scrollY < 200) navLinks.forEach((a) => a.classList.remove('is-active'));
    mx += (tx - mx) * 0.08;
    my += (ty - my) * 0.08;

    for (const s of scenes) {
      if (!s.on) continue;
      let d;
      if (s.top) {
        d = -scrollY;
      } else {
        const r = s.box.getBoundingClientRect();
        const lim = vh / 2 + r.height / 2;
        d = clamp(r.top + r.height / 2 - vh / 2, -lim, lim);
      }
      for (const l of s.layers) {
        if (!motion) {
          l.el.style.transform = l.tilt ? `rotate(${l.tilt}deg)` : '';
          l.el.style.opacity = '';
          continue;
        }
        const x = s.top ? mx * l.depth * 70 : 0;
        const y = -d * l.depth * k + (s.top ? my * l.depth * 70 : 0);
        const rot = l.tilt - d * l.rot;
        l.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)` + (rot ? ` rotate(${rot.toFixed(2)}deg)` : '');
        if (l.fade) l.el.style.opacity = String(clamp(1 + d / (vh * 1.1), 0, 1).toFixed(3));
      }
    }

    for (const w of windows) {
      if (!w.on || !w.img) continue;
      if (!motion) {
        w.img.style.transform = '';
        continue;
      }
      const r = w.box.getBoundingClientRect();
      const p = clamp((r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2), -1, 1);
      w.img.style.transform = `translate3d(0,${(-p * r.height * w.k).toFixed(1)}px,0)`;
    }

    if (motion && (Math.abs(tx - mx) > 0.001 || Math.abs(ty - my) > 0.001)) request();
  }

  const hero = $('.hero');
  if (matchMedia('(pointer: fine)').matches) {
    hero.addEventListener('pointermove', (e) => {
      tx = e.clientX / innerWidth - 0.5;
      ty = e.clientY / innerHeight - 0.5;
      request();
    });
    hero.addEventListener('pointerleave', () => {
      tx = 0;
      ty = 0;
      request();
    });
  }
  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  reduceMotion.addEventListener?.('change', request);

  /* ---------- слайдер первого экрана ---------- */
  const slides = $$('.slide');
  const dots = $$('.dot');
  let current = 0;
  let slideTimer = 0;
  let heroOnScreen = true;
  function showSlide(i) {
    current = (i + slides.length) % slides.length;
    slides.forEach((s, n) => s.classList.toggle('is-active', n === current));
    dots.forEach((d, n) => {
      d.classList.toggle('is-active', n === current);
      d.setAttribute('aria-pressed', String(n === current));
    });
  }
  function scheduleSlide() {
    clearTimeout(slideTimer);
    if (slides.length < 2 || reduceMotion.matches || !heroOnScreen || document.hidden) return;
    slideTimer = setTimeout(() => {
      showSlide(current + 1);
      scheduleSlide();
    }, 6500);
  }
  dots.forEach((d, n) => d.addEventListener('click', () => {
    showSlide(n);
    scheduleSlide();
  }));
  new IntersectionObserver(([e]) => {
    heroOnScreen = e.isIntersecting;
    scheduleSlide();
  }).observe(hero);
  document.addEventListener('visibilitychange', scheduleSlide);
  reduceMotion.addEventListener?.('change', scheduleSlide);

  // лепестки падают на всю высоту области с фото
  const fall = $('[data-fall]');
  if (fall) {
    const setFall = () => fall.style.setProperty('--fall-h', `${fall.clientHeight + 80}px`);
    setFall();
    if ('ResizeObserver' in window) new ResizeObserver(setFall).observe(fall);
    else addEventListener('resize', setFall);
  }

  /* ---------- заказ: элементы и состояние ---------- */
  const cart = new Map(); // id → количество
  let products = new Map(); // id → { kind: bouquet|flower|custom, name, price, img }
  let lastSent = null; // { id, sig } — номер уже записан для этой корзины
  let selDay = null; // выбранный день yyyy-mm-dd
  let selSlot = null; // выбранный интервал
  let whenHint = '';

  const drawer = $('#order');
  const panel = $('.order__panel', drawer);
  const list = $('[data-list]', drawer);
  const empty = $('[data-empty]', drawer);
  const daysBox = $('[data-days]', drawer);
  const slotsBox = $('[data-slots]', drawer);
  const hintBox = $('[data-when-hint]', drawer);
  const textBox = $('[data-text]', drawer);
  const toastBox = $('[data-toast]');
  const statusBox = $('[data-status]', drawer);
  const obarText = $('[data-obar-text]');
  const SLOTS = store ? store.SLOTS : [];

  /* ---------- каталоги: букеты и цветы поштучно, по 10 на странице ---------- */
  const grid = $('.grid');
  const fgrid = $('[data-flowers]');
  const chips = $$('.chip');
  let filter = 'all';
  let bouquetList = [];
  let flowerList = [];
  const pages = { bouquets: 0, flowers: 0 };

  function cardHtml(p, i) {
    const price = p.price ? `<span class="price">${money(p.price, ' ')}</span>` : '<span class="price price--ask">цена по&nbsp;запросу</span>';
    const tag = p.tag ? `<span class="card__tag">${esc(p.tag)}</span>` : '';
    return `<article class="card reveal" style="--d:${((i % 5) * 0.05).toFixed(2)}s" data-id="${esc(p.id)}" data-cat="${esc(p.cat)}">`
      + `<div class="card__media" data-window="0.06"><div class="card__zoom"><img src="${esc(p.img)}" alt="${esc(p.alt || p.name)}" width="800" height="800" loading="lazy" decoding="async"></div>${tag}</div>`
      + `<div class="card__body"><h3 class="card__title">${nbsp(esc(p.name))}</h3>`
      + `<p class="card__desc">${nbsp(esc(p.desc || ''))}</p>`
      + '<span class="card__orn" aria-hidden="true"><i></i><svg><use href="#logo-o"/></svg><i></i></span>'
      + `${price}<div class="card__action" data-action-for="${esc(p.id)}"></div></div></article>`;
  }
  function flowerHtml(p, i) {
    const price = p.price ? `<span class="fcard__price">${money(p.price, ' ')}<small>&nbsp;/ шт</small></span>` : '<span class="fcard__price fcard__price--ask">цена по&nbsp;запросу</span>';
    return `<article class="fcard reveal" style="--d:${((i % 5) * 0.05).toFixed(2)}s" data-id="${esc(p.id)}">`
      + `<div class="fcard__photo"><img src="${esc(p.img)}" alt="${esc(p.name)}" width="360" height="360" loading="lazy" decoding="async"></div>`
      + `<h3 class="fcard__name">${nbsp(esc(p.name))}</h3>`
      + `<p class="fcard__desc">${nbsp(esc(p.desc || ''))}</p>`
      + `${price}<div class="card__action" data-action-for="${esc(p.id)}"></div></article>`;
  }

  function renderPager(kind, count) {
    const nav = $(`[data-pager="${kind}"]`);
    if (!nav) return;
    nav.hidden = count < 2;
    if (count < 2) {
      nav.innerHTML = '';
      return;
    }
    const p = pages[kind];
    nav.innerHTML = `<button class="pager__arrow" type="button" data-page-step="${kind}:-1" aria-label="Предыдущая страница"${p === 0 ? ' disabled' : ''}><svg class="ico" aria-hidden="true"><use href="#i-left"/></svg></button>`
      + Array.from({ length: count }, (_, i) => `<button class="pager__dot${i === p ? ' is-active' : ''}" type="button" data-page-go="${kind}:${i}" aria-label="Страница ${i + 1} из ${count}"${i === p ? ' aria-current="page"' : ''}></button>`).join('')
      + `<button class="pager__arrow" type="button" data-page-step="${kind}:1" aria-label="Следующая страница"${p === count - 1 ? ' disabled' : ''}><svg class="ico" aria-hidden="true"><use href="#i-right"/></svg></button>`;
  }
  function renderGrid(kind, scroll) {
    const isB = kind === 'bouquets';
    const box = isB ? grid : fgrid;
    if (!box) return;
    const items = isB ? bouquetList.filter((p) => filter === 'all' || p.cat === filter) : flowerList;
    const count = Math.max(1, Math.ceil(items.length / PAGE));
    pages[kind] = clamp(pages[kind], 0, count - 1);
    const slice = items.slice(pages[kind] * PAGE, pages[kind] * PAGE + PAGE);
    box.innerHTML = slice.length
      ? slice.map(isB ? cardHtml : flowerHtml).join('')
      : `<p class="grid__empty">${isB ? 'Скоро здесь появятся букеты.' : 'Список цветов обновляется — напишите флористу, что нужно.'}</p>`;
    renderPager(kind, count);
    renderActions(box);
    observeReveal(box);
    collectWindows();
    if (scroll) box.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
  }

  function mountCatalog() {
    if (store) {
      bouquetList = store.getProducts().filter((p) => !p.hidden);
      flowerList = store.getFlowers().filter((p) => !p.hidden);
      products = new Map([
        ...bouquetList.map((p) => [p.id, { kind: 'bouquet', name: p.name, price: p.price || 0, img: p.img }]),
        ...flowerList.map((p) => [p.id, { kind: 'flower', name: p.name, price: p.price || 0, img: p.img }]),
      ]);
      const cats = new Set(bouquetList.map((p) => p.cat));
      chips.forEach((c) => { c.hidden = c.dataset.filter !== 'all' && !cats.has(c.dataset.filter); });
      if (filter !== 'all' && !cats.has(filter)) filter = 'all';
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === filter)));
      renderGrid('bouquets');
      renderGrid('flowers');
      const flowersSection = $('#flowers');
      if (flowersSection) flowersSection.hidden = !flowerList.length;
      const flowersLink = $('.nav a[href="#flowers"]');
      if (flowersLink) flowersLink.hidden = !flowerList.length;
    } else {
      // запасной вариант: карточки, которые уже есть в HTML
      products = new Map($$('.card', grid).map((card) => [card.dataset.id, { kind: 'bouquet', name: card.dataset.name, price: Number(card.dataset.price) || 0, img: $('img', card).getAttribute('src') }]));
      const flowersSection = $('#flowers');
      if (flowersSection) flowersSection.hidden = true;
    }
    products.set('custom', { kind: 'custom', name: 'Индивидуальный букет', price: 0 });
    for (const id of [...cart.keys()]) if (!products.has(id)) cart.delete(id);
  }

  chips.forEach((chip) => chip.addEventListener('click', () => {
    filter = chip.dataset.filter;
    pages.bouquets = 0;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    renderGrid('bouquets');
  }));

  /* ---------- поиск цветов и букетов ---------- */
  const searchEl = $('[data-search]');
  const searchInput = $('[data-search-input]');
  const searchResults = $('[data-search-results]');
  let searchOpener = null;
  const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е');
  // «розы» → «роз», «хризантемы» → «хризантем»: находим слово в любом падеже
  const stem = (w) => (w.length >= 4 ? w.replace(/(ами|ями|ов|ев|ей|ам|ям|ах|ях|ы|и|а|я|е|у|ю|о)$/, '') : w);
  function matches(item, query) {
    const words = norm(query).split(/[^a-zа-я0-9]+/).filter(Boolean).map(stem);
    const hay = norm(`${item.name} ${item.desc || ''} ${item.tag || ''} ${store && item.cat ? store.CATS[item.cat] : ''}`);
    return words.length > 0 && words.every((w) => hay.includes(w));
  }
  function resultHtml(p, isFlower) {
    const price = p.price ? `${money(p.price, ' ')}${isFlower ? ' / шт' : ''}` : 'цена по запросу';
    return `<li class="sres"><img class="sres__img${isFlower ? ' sres__img--round' : ''}" src="${esc(p.img)}" alt="" width="64" height="64" loading="lazy">`
      + `<div class="sres__info"><b>${esc(p.name)}</b><span>${esc(p.desc || '')}</span><em>${price}</em></div>`
      + `<div class="sres__action card__action" data-action-for="${esc(p.id)}"></div></li>`;
  }
  function renderSearch() {
    if (searchEl.hidden) return;
    const q = searchInput.value.trim();
    if (!q) {
      searchResults.innerHTML = '<p class="search__hint">Начните вводить: например, «розы», «хризантемы» или&nbsp;«корзина».</p>';
      return;
    }
    const b = bouquetList.filter((p) => matches(p, q));
    const f = flowerList.filter((p) => matches(p, q));
    if (!b.length && !f.length) {
      searchResults.innerHTML = `<div class="search__none"><p>По запросу «${esc(q)}» ничего не&nbsp;нашли.</p><p>Флорист может собрать букет по&nbsp;вашему описанию.</p><button class="btn btn--cta btn--sm" type="button" data-custom>Написать флористу</button></div>`;
      return;
    }
    const group = (title, items, isFlower) => (items.length ? `<section class="search__group"><h3>${title} <span>${items.length}</span></h3><ul>${items.map((p) => resultHtml(p, isFlower)).join('')}</ul></section>` : '');
    searchResults.innerHTML = group('Букеты', b, false) + group('Цветы поштучно', f, true);
    renderActions(searchResults);
  }
  function openSearch(from) {
    searchOpener = from || document.activeElement;
    setMenu(false);
    searchEl.hidden = false;
    document.documentElement.classList.add('is-locked');
    renderSearch();
    searchInput.focus();
  }
  function closeSearch() {
    if (searchEl.hidden) return;
    searchEl.hidden = true;
    if (drawer.hidden) document.documentElement.classList.remove('is-locked');
    searchOpener?.focus?.({ preventScroll: true });
  }
  searchInput.addEventListener('input', renderSearch);

  /* ---------- когда нужен букет: дни и интервалы из графика магазина ---------- */
  const shortDate = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
  function availability() {
    if (store) return store.availability();
    return [];
  }
  function renderWhen() {
    const days = availability();
    if (!days.length) {
      daysBox.closest('.field').hidden = true;
      return;
    }
    if (selDay && !days.some((d) => d.key === selDay && d.open)) {
      selDay = null;
      selSlot = null;
      whenHint = 'Магазин закрыл этот день — выберите другой.';
    }
    const day = days.find((d) => d.key === selDay);
    if (day && selSlot && !day.slots.some((s) => s.id === selSlot && !s.blocked && !s.past)) {
      selSlot = null;
      whenHint = 'Это время магазин закрыл — выберите другое.';
    }
    daysBox.innerHTML = days.map((d) => {
      const name = d.index === 0 ? 'Сегодня' : d.index === 1 ? 'Завтра' : d.date.toLocaleDateString('ru-RU', { weekday: 'short' });
      const late = d.slots.every((s) => s.past || s.blocked) && d.slots.some((s) => s.past);
      const sub = d.closed ? 'нет приёма' : d.open ? shortDate(d.date) : late ? 'уже поздно' : 'всё занято';
      const on = d.key === selDay;
      return `<button class="day${on ? ' is-on' : ''}" type="button" data-day="${d.key}" aria-pressed="${on}"${d.open ? '' : ' disabled'}><b>${name}</b><span>${sub}</span></button>`;
    }).join('');
    slotsBox.hidden = !day;
    slotsBox.innerHTML = day
      ? day.slots.map((s) => {
        const off = s.blocked || s.past;
        const on = s.id === selSlot;
        return `<button class="slot${on ? ' is-on' : ''}" type="button" data-slot="${s.id}" aria-pressed="${on}"${off ? ' disabled' : ''}>${s.label}${s.blocked ? '<small>закрыто</small>' : s.past ? '<small>прошло</small>' : ''}</button>`;
      }).join('')
      : '';
    hintBox.textContent = whenHint || (day ? (selSlot ? '' : 'Выберите удобное время или договоритесь в чате.') : 'Выберите день — покажем свободное время. Можно не выбирать и договориться в чате.');
  }

  /* ---------- заказ: текст, номер, мессенджеры ---------- */
  const way =() => $('input[name="way"]:checked', drawer)?.value || 'доставка';
  function when() {
    if (!selDay) return '';
    const d = store.parseDay(selDay);
    let s = d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'long' });
    const slot = SLOTS.find((x) => x.id === selSlot);
    if (slot) s += `, ${slot.label}`;
    return s;
  }
  const signature = () => JSON.stringify([[...cart], selDay, selSlot, way()]);
  // номер, который получит заказ (или уже получил, если корзина не менялась)
  const orderNumber = () => (lastSent && lastSent.sig === signature() ? lastSent.id : store ? store.peekNextOrderId() : null);

  const QUICK_TEXT = 'Здравствуйте! Хочу заказать букет. (Пишу с сайта)';
  function orderText() {
    const n = orderNumber();
    const lines = [];
    if (cart.size) {
      lines.push(n ? `Здравствуйте! Заказ № ${n} с сайта:` : 'Здравствуйте! Хочу заказать:');
      let sum = 0;
      let allPriced = true;
      cart.forEach((q, id) => {
        const p = products.get(id);
        if (p.kind === 'custom') {
          lines.push('— индивидуальный букет, пожелания опишу в чате');
          allPriced = false;
          return;
        }
        let line = `— ${p.name}`;
        if (p.kind === 'flower') line += ` × ${q} шт`;
        else if (q > 1) line += ` × ${q}`;
        if (p.price) {
          line += `, ${money(p.price * q)}`;
          sum += p.price * q;
        } else {
          allPriced = false;
        }
        lines.push(line);
      });
      if (allPriced && cart.size > 1) lines.push(`Сумма по ценам сайта: ${money(sum)}`);
    } else {
      lines.push(n ? `Здравствуйте! Хочу заказать букет (заявка № ${n} с сайта).` : 'Здравствуйте! Хочу заказать букет.');
    }
    const w = when();
    if (w) lines.push(`Когда: ${w}`);
    lines.push(way() === 'доставка' ? 'Получение: доставка, адрес напишу в чате' : 'Получение: самовывоз');
    if (!n) lines.push('(Заказ с сайта)');
    return lines.join('\n');
  }

  // Записать заказ для админки (демо — в этом браузере). Повторное нажатие с той же корзиной номер не меняет.
  function recordOrder(channel) {
    if (!store) return null;
    const sig = signature();
    if (lastSent && lastSent.sig === sig && store.getOrders().some((o) => o.id === lastSent.id)) {
      store.updateOrder(lastSent.id, { channel });
      return lastSent.id;
    }
    const items = [...cart].map(([id, q]) => {
      const p = products.get(id);
      return { id, kind: p.kind, name: p.name, qty: q, price: p.price || null };
    });
    const slot = SLOTS.find((x) => x.id === selSlot);
    const order = store.createOrder({ items, date: selDay || '', time: slot ? slot.label : '', when: when(), way: way(), channel });
    if (!order) return null;
    lastSent = { id: order.id, sig };
    return order.id;
  }

  function channelHref(kind, text) {
    const t = encodeURIComponent(text);
    switch (kind) {
      case 'telegram': return SHOP.telegram ? `https://t.me/${SHOP.telegram}?text=${t}` : `https://t.me/${SHOP.phone}`;
      case 'whatsapp': return `https://wa.me/${SHOP.whatsapp}?text=${t}`;
      case 'max': return SHOP.max || `https://max.ru/:share?text=${t}`;
      case 'sms': return `sms:${SHOP.phone}?&body=${t}`;
      default: return '#';
    }
  }
  function channelHint(kind) {
    if (kind === 'max' && !SHOP.max) return 'В MAX выберите чат магазина — текст уже подставлен и скопирован.';
    if (kind === 'telegram' && !SHOP.telegram) return 'Текст скопирован — вставьте его в чат с магазином.';
    if (kind === 'max') return 'Текст скопирован — вставьте его в чат с магазином.';
    return 'Открываем чат с готовым сообщением. Текст также скопирован.';
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // открыто с диска или старый браузер — копируем по-старому
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  // Подсказка: в окне заказа — строкой под кнопками (ничего не закрывает), на странице — всплывашкой снизу.
  let toastTimer = 0;
  let statusTimer = 0;
  function toast(message) {
    if (!drawer.hidden) {
      statusBox.textContent = message;
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => { statusBox.textContent = ''; }, 7000);
      return;
    }
    toastBox.textContent = message;
    toastBox.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastBox.classList.remove('is-on'), 3400);
  }

  /* ---------- заказ: отрисовка ---------- */
  const stepperHtml = (id, q, small) =>
    `<div class="stepper${small ? ' stepper--sm' : ''}" role="group" aria-label="Количество"><button type="button" data-dec="${esc(id)}" aria-label="Убрать один">−</button><output>${q}</output><button type="button" data-inc="${esc(id)}" aria-label="Добавить ещё один">+</button></div>`;
  function actionHtml(id, q) {
    if (q) return stepperHtml(id, q, false);
    const label = products.get(id)?.kind === 'flower' ? 'Добавить' : 'В заказ';
    return `<button class="btn btn--action btn--block" type="button" data-add="${esc(id)}"><svg class="ico" aria-hidden="true"><use href="#i-bag"/></svg>${label}</button>`;
  }
  // Кнопки «В заказ» / счётчики во всех местах, где виден товар: каталог и поиск.
  function renderActions(root = document) {
    $$('[data-action-for]', root).forEach((box) => {
      const id = box.dataset.actionFor;
      const q = cart.get(id) || 0;
      if (box.dataset.q === String(q)) return;
      const focused = box.contains(document.activeElement) ? document.activeElement : null;
      const kind = focused ? (focused.dataset.add ? 'add' : focused.dataset.inc ? 'inc' : 'dec') : null;
      box.dataset.q = String(q);
      box.innerHTML = actionHtml(id, q);
      if (!kind) return;
      const target = q ? $(kind === 'add' ? '[data-inc]' : `[data-${kind}]`, box) : $('[data-add]', box);
      target?.focus();
    });
  }

  function itemRow(id, q) {
    const p = products.get(id);
    const li = document.createElement('li');
    li.className = 'oitem';
    if (p.kind === 'custom') {
      li.innerHTML = '<span class="oitem__ph"><svg aria-hidden="true"><use href="#logo-o"/></svg></span>';
    } else {
      const img = document.createElement('img');
      img.src = p.img;
      img.alt = '';
      img.width = 56;
      img.height = 56;
      if (p.kind === 'flower') img.className = 'is-round';
      li.append(img);
    }
    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'oitem__name';
    name.textContent = p.name;
    const sub = document.createElement('div');
    sub.className = 'oitem__sub';
    const unit = p.kind === 'flower' ? ' шт' : '';
    if (p.kind === 'custom') sub.textContent = 'Пожелания опишете в чате';
    else if (p.price) sub.textContent = q > 1 ? `${money(p.price, ' ')} × ${q}${unit} = ${money(p.price * q, ' ')}` : money(p.price, ' ');
    else sub.textContent = p.kind === 'flower' ? `Поштучно · цену подтвердит флорист` : 'Цену подтвердит флорист';
    info.append(name, sub);
    li.append(info);
    const controls = document.createElement('div');
    controls.innerHTML = p.kind === 'custom'
      ? '<button class="icon-btn" type="button" data-remove="custom" aria-label="Убрать индивидуальный букет"><svg class="ico" aria-hidden="true"><use href="#i-close"/></svg></button>'
      : stepperHtml(id, q, true);
    li.append(controls);
    return li;
  }

  function render() {
    const n = cart.size; // позиции: букет, роза поштучно и т.д.
    const active = document.activeElement;
    const keep = active && list.contains(active)
      ? (['inc', 'dec', 'remove'].map((k) => [k, active.dataset[k]]).find(([, v]) => v !== undefined) || null)
      : null;

    renderActions();
    list.replaceChildren(...[...cart].map(([id, q]) => itemRow(id, q)));
    empty.hidden = cart.size > 0;

    const text = orderText();
    textBox.textContent = text;
    $$('[data-channel]', drawer).forEach((a) => { a.href = channelHref(a.dataset.channel, text); });
    $$('[data-count]').forEach((el) => {
      el.textContent = String(n);
      el.hidden = n === 0;
    });
    obarText.textContent = `В заказе ${n} ${plural(n, ['позиция', 'позиции', 'позиций'])}`;
    document.body.classList.toggle('has-order', n > 0);

    if (keep) {
      const [k, id] = keep;
      ($(`[data-${k}="${CSS.escape(id)}"]`, list) || $(`[data-inc="${CSS.escape(id)}"]`, list) || panel).focus();
    }
  }

  /* ---------- окно заказа ---------- */
  let opener = null;
  function openOrder(from) {
    closeSearch();
    opener = from || document.activeElement;
    setMenu(false);
    toastBox.classList.remove('is-on');
    whenHint = '';
    renderWhen(); // «сегодня» могло уже пройти
    render();
    drawer.hidden = false;
    document.documentElement.classList.add('is-locked');
    void drawer.offsetWidth; // чтобы сработала анимация выезда
    drawer.classList.add('is-open');
    $('.order__head [data-close-order]', drawer).focus({ preventScroll: true });
  }
  function closeOrder() {
    if (drawer.hidden) return;
    drawer.classList.remove('is-open');
    document.documentElement.classList.remove('is-locked');
    if (reduceMotion.matches) drawer.hidden = true;
    else setTimeout(() => { if (!drawer.classList.contains('is-open')) drawer.hidden = true; }, 380);
    opener?.focus?.({ preventScroll: true });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && header.classList.contains('is-open')) setMenu(false);
    if (e.key === 'Escape' && !searchEl.hidden) {
      closeSearch();
      return;
    }
    if (drawer.hidden) return;
    if (e.key === 'Escape') {
      closeOrder();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = $$('a[href], button:not([disabled]), input', panel).filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-add],[data-inc],[data-dec],[data-remove],[data-custom],[data-open-order],[data-close-order],[data-copy],[data-channel],[data-open-search],[data-close-search],[data-day],[data-slot],[data-page-go],[data-page-step]');
    if (!el) return;
    const d = el.dataset;
    if (d.add) {
      cart.set(d.add, 1);
      render();
      if (searchEl.hidden) toast(`«${products.get(d.add).name}» — в заказе`);
    } else if (d.inc) {
      cart.set(d.inc, (cart.get(d.inc) || 0) + 1);
      render();
    } else if (d.dec) {
      const q = (cart.get(d.dec) || 0) - 1;
      if (q > 0) cart.set(d.dec, q);
      else cart.delete(d.dec);
      render();
    } else if (d.remove) {
      cart.delete(d.remove);
      render();
    } else if ('custom' in d) {
      if (!cart.has('custom')) cart.set('custom', 1);
      render();
      if (drawer.hidden) openOrder(el);
    } else if ('openOrder' in d) {
      openOrder(el);
    } else if ('closeOrder' in d) {
      closeOrder();
    } else if ('openSearch' in d) {
      openSearch(el);
    } else if ('closeSearch' in d) {
      closeSearch();
    } else if (d.day) {
      selDay = selDay === d.day ? null : d.day;
      selSlot = null;
      whenHint = '';
      renderWhen();
      render();
    } else if (d.slot) {
      selSlot = selSlot === d.slot ? null : d.slot;
      whenHint = '';
      renderWhen();
      render();
    } else if (d.pageGo || d.pageStep) {
      const [kind, val] = (d.pageGo || d.pageStep).split(':');
      pages[kind] = d.pageGo ? Number(val) : pages[kind] + Number(val);
      renderGrid(kind, true);
    } else if ('copy' in d) {
      const id = recordOrder('copy');
      const text = orderText();
      render();
      copy(text).then((ok) => toast(ok ? `Текст заказа${id ? ` № ${id}` : ''} скопирован — вставьте его в чат с магазином` : 'Не получилось скопировать — выделите текст вручную'));
    } else if (d.channel) {
      const quick = 'quick' in d;
      const id = quick ? null : recordOrder(d.channel);
      const text = quick ? QUICK_TEXT : orderText();
      el.href = channelHref(d.channel, text);
      copy(text);
      if (!quick) render();
      toast(id ? `Заказ № ${id} сохранён. ${channelHint(d.channel)}` : channelHint(d.channel));
    }
  });

  $$('input[name="way"]', drawer).forEach((input) => input.addEventListener('change', render));
  $$('[data-channel][data-quick]').forEach((a) => { a.href = channelHref(a.dataset.channel, QUICK_TEXT); });
  if (!touch.matches) $$('[data-touch-only]').forEach((el) => { el.hidden = true; });

  // Админка открыта в другой вкладке этого браузера — обновляем каталоги, график и номера заказов.
  addEventListener('storage', (e) => {
    if (!store) return;
    const k = e.key;
    if (k === null || k === store.KEYS.products || k === store.KEYS.flowers) {
      mountCatalog();
      renderSearch();
      render();
    }
    if (k === null || k === store.KEYS.schedule) {
      renderWhen();
      render();
    }
    if (k === store.KEYS.orders || k === store.KEYS.seq) render();
  });

  mountCatalog();
  renderWhen();
  render();
  request();
})();
