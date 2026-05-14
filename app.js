/**
 * App - main routing, navigation, settings load
 */
window.APP = (function() {
  let settings = null;

  function formatSom(n) {
    if (!n && n !== 0) return '0';
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function toast(msg, type = '') {
    const t = document.getElementById('toast');
    if (!t) { alert(msg); return; }
    t.textContent = msg;
    t.className = 'toast show ' + type;
    setTimeout(() => t.classList.remove('show'), 3000);
  }

  function navigate(page) {
    // Profile va xarid sahifalari uchun avtorizatsiya kerak
    const protectedPages = ['profile', 'stars', 'premium', 'nft', 'arenda'];
    if (protectedPages.includes(page) && !AUTH.getUser()) {
      // Asinxron ravishda login qildiramiz, biroq home'da qolamiz
      AUTH.ensureLoggedIn().then(u => {
        if (u) {
          updateUserBadge();
          navigate(page);  // qayta urinish
        } else {
          toast("Telegram ID kiritmaguningizcha bu bo'limga kira olmaysiz", 'error');
        }
      });
      return;
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.querySelector(`.page[data-page="${page}"]`);
    if (target) target.classList.add('active');
    window.scrollTo(0, 0);
    try {
      if (page === 'profile' && window.PROFILE) PROFILE.refresh();
      if (page === 'nft' && window.NFT) NFT.refresh();
      if (page === 'arenda' && window.ARENDA) ARENDA.refresh();
      if (page === 'admin' && window.ADMIN_PANEL) ADMIN_PANEL.refresh();
    } catch (e) { console.error('navigate hook error:', e); }
  }

  function showModal(id) { document.getElementById(id).classList.add('show'); }
  function hideModal(id) { document.getElementById(id).classList.remove('show'); }

  function validateUsername(u) {
    if (!u) return false;
    const clean = u.replace(/^@/, '').trim();
    return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(clean);
  }

  async function submitOrder(orderData) {
    const user = AUTH.getUser();
    if (!user) { toast('Avval tizimga kiring', 'error'); return null; }
    const tx = {
      type: orderData.type, userId: user.telegramId,
      username: user.username, firstName: user.firstName,
      target: orderData.target || '', amount: orderData.amount || 0,
      stars: orderData.stars || 0, months: orderData.months || 0,
      nftId: orderData.nftId || null, nftName: orderData.nftName || '',
      nftImage: orderData.nftImage || '', tonUrl: orderData.tonUrl || '',
      days: orderData.days || 0, payMethod: orderData.payMethod || 'balance',
      status: 'pending', adminNote: ''
    };
    return await API.addTransaction(tx);
  }

  async function payWithBalance(amount) {
    const user = AUTH.getUser();
    if (!user) return false;
    if (user.balance < amount) {
      toast(`Balansda yetarli mablag' yo'q. Yetishmaydi: ${formatSom(amount - user.balance)} so'm`, 'error');
      return false;
    }
    await API.updateUserBalance(user.telegramId, -amount);
    await AUTH.refresh();
    updateUserBadge();
    return true;
  }

  function updateUserBadge() {
    const u = AUTH.getUser();
    if (!u) return;
    const nameEl = document.getElementById('userName');
    const balEl = document.getElementById('userBalance');
    const avEl = document.getElementById('userAvatar');
    if (nameEl) nameEl.textContent = u.firstName || u.username || 'User';
    if (balEl) balEl.textContent = formatSom(u.balance);
    if (avEl) avEl.textContent = (u.firstName || u.username || 'U').charAt(0).toUpperCase();
  }

  async function loadSettings() {
    settings = await API.getSettings();
    const p3 = document.getElementById('premium3Price');
    const p6 = document.getElementById('premium6Price');
    const p12 = document.getElementById('premium12Price');
    const rate = document.getElementById('starsRate');
    if (p3) p3.textContent = formatSom(settings.premium.p3) + ' so\'m';
    if (p6) p6.textContent = formatSom(settings.premium.p6) + ' so\'m';
    if (p12) p12.textContent = formatSom(settings.premium.p12) + ' so\'m';
    if (rate) rate.textContent = settings.starPrice;
    return settings;
  }

  function getSettings() { return settings; }

  async function loadStats() {
    try {
      const { users } = await API.getUsers();
      const { transactions } = await API.getTransactions();
      const sU = document.getElementById('statUsers');
      const sT = document.getElementById('statTransactions');
      if (sU) sU.textContent = users.length;
      if (sT) sT.textContent = transactions.filter(t => t.status === 'approved').length;
    } catch (e) { console.error('loadStats:', e); }
  }

  function youtubeEmbed(url) {
    if (!url) return '';
    if (url.includes('/embed/')) return url;
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/))([\w-]+)/);
    if (m) return `https://www.youtube.com/embed/${m[1]}`;
    return url;
  }

  function showGuide(type) {
    const url = youtubeEmbed((settings && settings.guides && settings.guides[type]) || '');
    if (!url) { toast('Qo\'llanma URL hali sozlanmagan', 'error'); return; }
    document.getElementById('guideTitle').textContent = `Qo'llanma — ${type.toUpperCase()}`;
    document.getElementById('guideVideo').src = url;
    showModal('guideModal');
  }

  // ============ LOTTIE ANIMATIONS ============
  function loadLottieAnimations() {
    if (typeof lottie === 'undefined') {
      setTimeout(loadLottieAnimations, 200);
      return;
    }
    document.querySelectorAll('[data-lottie]').forEach(el => {
      if (el.dataset.lottieLoaded) return;
      try {
        const anim = lottie.loadAnimation({
          container: el,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: el.dataset.lottie
        });
        anim.addEventListener('DOMLoaded', () => {
          el.setAttribute('data-lottie-loaded', '1');
        });
        anim.addEventListener('data_failed', () => {
          console.warn('Lottie data failed for', el.dataset.lottie);
        });
        el.dataset.lottieLoaded = 'pending';
      } catch(e) { console.error('Lottie:', e); }
    });
  }

  // ============ EVENT LISTENERS - har doim bog'lanadi ============
  function attachGlobalListeners() {
    document.body.addEventListener('click', e => {
      const navBtn = e.target.closest('[data-nav]');
      if (navBtn) {
        e.preventDefault();
        navigate(navBtn.dataset.nav);
        return;
      }
      const closeBtn = e.target.closest('[data-close]');
      if (closeBtn) {
        const modal = closeBtn.closest('.modal');
        if (modal) modal.classList.remove('show');
        const vid = document.getElementById('guideVideo');
        if (vid && vid.src) vid.src = '';
        return;
      }
      if (e.target.classList.contains('modal')) {
        e.target.classList.remove('show');
        const vid = document.getElementById('guideVideo');
        if (vid && vid.src) vid.src = '';
      }
    });

    const adminLink = document.getElementById('adminPanelLink');
    if (adminLink) adminLink.addEventListener('click', () => navigate('admin-login'));

    const contactBtn = document.getElementById('contactAdminBtn');
    if (contactBtn) contactBtn.addEventListener('click', () => {
      const u = (settings && settings.adminUsername) || CONFIG.ADMIN.USERNAME;
      window.open(`https://t.me/${u}`, '_blank');
    });
  }

  // ============ INIT ============
  async function init() {
    console.log('PRUM STAR starting...');
    // 1) Listenerlarni darrov bog'lash - bu eng asosiy fix
    attachGlobalListeners();
    // 2) Lottie animatsiyalarni yuklash
    loadLottieAnimations();
    // 3) Sozlamalar
    try { await loadSettings(); }
    catch(e) { console.error('loadSettings:', e); toast('Sozlamalarni yuklashda xatolik', 'error'); }
    // 4) Auth
    try {
      const user = await AUTH.init();
      if (user) updateUserBadge();
    } catch(e) { console.error('Auth:', e); }
    // 5) Stats
    loadStats();
    console.log('PRUM STAR ready');
  }

  return {
    init, navigate, showModal, hideModal, toast, submitOrder, payWithBalance,
    updateUserBadge, validateUsername, formatSom, loadSettings, getSettings,
    loadStats, showGuide, loadLottieAnimations
  };
})();

document.addEventListener('DOMContentLoaded', APP.init);
