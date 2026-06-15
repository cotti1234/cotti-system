/* =========================================================================
   Lumoweb Auth — demo login system (frontend only)

   NOTE: This is a DEMO. Accounts and the "session" live in localStorage and
   passwords are only lightly hashed for obfuscation. Do NOT use this as real
   authentication — wire it to a backend before going live.
   ========================================================================= */

(function (global) {
  "use strict";

  const USERS_KEY = "lumoweb.users";
  const SESSION_KEY = "lumoweb.session";

  const read = (k, fb) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; }
  };
  const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  /* Tiny non-cryptographic hash — obfuscation only, not security. */
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  }

  function getUsers() { return read(USERS_KEY, {}); }

  function register({ name, email, password }) {
    const users = getUsers();
    const key = email.toLowerCase();
    if (users[key]) {
      return { ok: false, error: "Diese E-Mail ist bereits registriert." };
    }
    users[key] = { name, email: key, pw: hash(password), created: Date.now() };
    write(USERS_KEY, users);
    startSession(key);
    return { ok: true, user: publicUser(users[key]) };
  }

  function login({ email, password, remember }) {
    const users = getUsers();
    const key = email.toLowerCase();
    const u = users[key];
    if (!u || u.pw !== hash(password)) {
      return { ok: false, error: "E-Mail oder Passwort ist falsch." };
    }
    startSession(key, remember);
    return { ok: true, user: publicUser(u) };
  }

  function startSession(email, remember = true) {
    write(SESSION_KEY, { email, remember, at: Date.now() });
  }

  function currentUser() {
    const s = read(SESSION_KEY, null);
    if (!s) return null;
    const u = getUsers()[s.email];
    return u ? publicUser(u) : null;
  }

  function logout() { localStorage.removeItem(SESSION_KEY); }

  function publicUser(u) { return { name: u.name, email: u.email, created: u.created }; }

  global.LumoAuth = { register, login, logout, currentUser };
})(window);
