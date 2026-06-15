/* =========================================================================
   Lumoweb — site interactions (theme, nav, reveal, account state)
   ========================================================================= */

(function () {
  "use strict";

  /* ---- Theme (persisted, respects system preference) ---- */
  const THEME_KEY = "lumoweb.theme";
  const root = document.documentElement;

  function applyTheme(t) {
    root.setAttribute("data-theme", t);
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      const sun = btn.querySelector(".ic-sun");
      const moon = btn.querySelector(".ic-moon");
      if (sun && moon) {
        sun.style.display = t === "dark" ? "block" : "none";
        moon.style.display = t === "dark" ? "none" : "block";
      }
    });
  }

  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(saved || (prefersDark ? "dark" : "light"));

  document.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-theme-toggle]");
    if (!toggle) return;
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  /* ---- Sticky nav shadow ---- */
  const nav = document.querySelector(".nav");
  if (nav) {
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---- Mobile menu ---- */
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".nav-links");
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => navLinks.classList.toggle("open"));
    navLinks.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => navLinks.classList.remove("open"))
    );
  }

  /* ---- Password visibility toggles ---- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest(".toggle-pw");
    if (!t) return;
    const input = t.parentElement.querySelector("input");
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    t.querySelector(".ic-eye").style.display = show ? "none" : "block";
    t.querySelector(".ic-eye-off").style.display = show ? "block" : "none";
  });

  /* ---- Scroll reveal ---- */
  const reveals = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window && reveals.length) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("in"));
  }

  /* ---- Account-aware nav (homepage) ---- */
  function refreshAccount() {
    if (!window.LumoAuth) return;
    const user = window.LumoAuth.currentUser();
    document.querySelectorAll("[data-when-auth]").forEach((el) => {
      el.style.display = user ? "" : "none";
    });
    document.querySelectorAll("[data-when-guest]").forEach((el) => {
      el.style.display = user ? "none" : "";
    });
    if (user) {
      document.querySelectorAll("[data-user-name]").forEach((el) => (el.textContent = user.name));
      document.querySelectorAll("[data-user-email]").forEach((el) => (el.textContent = user.email));
    }
  }
  refreshAccount();

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-logout]")) {
      e.preventDefault();
      window.LumoAuth && window.LumoAuth.logout();
      refreshAccount();
    }
  });

  /* ---- Contact form (uses the validation Regelwerk) ---- */
  const contact = document.getElementById("contactForm");
  if (contact && window.LumoValidate) {
    const alertBox = contact.querySelector(".alert");
    window.LumoValidate.attach(contact, {
      onValid: () => {
        contact.reset();
        contact.querySelectorAll(".field").forEach((f) => f.classList.remove("is-valid", "is-invalid"));
        if (alertBox) {
          alertBox.className = "alert alert-ok show";
          alertBox.innerHTML =
            '<svg class="icon"><use href="assets/icons/sprite.svg#i-check"/></svg> Danke! Deine Nachricht wurde gesendet.';
        }
      },
    });
  }
})();
