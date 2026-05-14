/**
 * Auth - foydalanuvchini aniqlash.
 * 1) Telegram WebApp ichida = avtomatik
 * 2) Brauzerda = localStorage'dan ID, yo'q bo'lsa keyinroq so'raymiz (xarid paytida)
 */
window.AUTH = (function() {
  let currentUser = null;

  function isTelegramWebApp() {
    return typeof window.Telegram !== 'undefined'
      && window.Telegram.WebApp
      && window.Telegram.WebApp.initDataUnsafe?.user;
  }

  function getReferralFromUrl() {
    const params = new URLSearchParams(location.search);
    return params.get('ref') || params.get('start') || null;
  }

  function genReferralCode(userId) {
    return 'r' + parseInt(userId).toString(36) + Math.random().toString(36).slice(2, 5);
  }

  async function init() {
    let telegramId, username = '', firstName = '', photoUrl = '';

    if (isTelegramWebApp()) {
      const tg = window.Telegram.WebApp;
      const u = tg.initDataUnsafe.user;
      telegramId = String(u.id);
      username = u.username || '';
      firstName = u.first_name || '';
      photoUrl = u.photo_url || '';
      try { tg.expand(); tg.ready(); } catch(e) {}
    } else {
      // Brauzerda - localStorage'dan tekshirish (PROMPT QILMAYMIZ)
      telegramId = localStorage.getItem('prumstar_user_id');
      if (!telegramId) {
        // Foydalanuvchi hali ID kiritmagan - mehmon rejimi
        console.log('No Telegram ID yet. User is in guest mode.');
        return null;
      }
      firstName = localStorage.getItem('prumstar_user_name') || ('User' + telegramId.slice(-3));
      username = localStorage.getItem('prumstar_user_username') || '';
    }

    return await loginUser(telegramId, username, firstName, photoUrl);
  }

  // Xarid yoki balans to'ldirish paytida ID so'rash
  async function ensureLoggedIn() {
    if (currentUser) return currentUser;
    if (isTelegramWebApp()) {
      return await init();
    }
    const id = await promptForTelegramId();
    if (!id) return null;
    localStorage.setItem('prumstar_user_id', id);
    return await loginUser(id, '', 'User' + id.slice(-3), '');
  }

  async function loginUser(telegramId, username, firstName, photoUrl) {
    let user = await API.findUser(telegramId);
    if (!user) {
      const refCode = genReferralCode(telegramId);
      const refBy = getReferralFromUrl();
      user = {
        telegramId, username, firstName, photoUrl,
        balance: 0,
        referralCode: refCode,
        referredBy: refBy,
        referrals: [],
        starBonus: 0,
        createdAt: new Date().toISOString()
      };
      await API.upsertUser(user);

      if (refBy) {
        const usersData = await API.getUsers();
        const inviter = usersData.users.find(x => x.referralCode === refBy);
        if (inviter) {
          inviter.referrals = inviter.referrals || [];
          if (!inviter.referrals.includes(telegramId)) {
            inviter.referrals.push(telegramId);
            await API.saveUsers(usersData.users);
          }
        }
      }
    } else if (username && user.username !== username) {
      user.username = username;
      await API.upsertUser(user);
    }
    currentUser = user;
    return user;
  }

  function promptForTelegramId() {
    return new Promise(resolve => {
      const id = prompt(
        "👋 PRUM STAR\n\n" +
        "Iltimos, Telegram ID raqamingizni kiriting.\n" +
        "(@userinfobot ga /start yuborib ID ni ko'rishingiz mumkin)"
      );
      if (id && /^\d{5,15}$/.test(id.trim())) resolve(id.trim());
      else resolve(null);
    });
  }

  function getUser() { return currentUser; }

  async function refresh() {
    if (!currentUser) return null;
    currentUser = await API.findUser(currentUser.telegramId);
    return currentUser;
  }

  return { init, ensureLoggedIn, getUser, refresh, getReferralFromUrl };
})();
