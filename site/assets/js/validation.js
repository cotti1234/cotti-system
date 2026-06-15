/* =========================================================================
   Lumoweb Validation — Formular-Regelwerk
   A small, declarative form-validation engine.

   Each <input data-rules="required|email|min:3"> declares its rule set.
   Rules are pipe-separated; arguments follow a colon (e.g. min:8).
   Cross-field rule "match:password" compares against another field's value.
   ========================================================================= */

(function (global) {
  "use strict";

  /* --- Rule library: name -> { test(value, arg, form), msg(arg) } --- */
  const RULES = {
    required: {
      test: (v) => v.trim().length > 0,
      msg: () => "Dieses Feld ist erforderlich.",
    },
    email: {
      test: (v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()),
      msg: () => "Bitte gib eine gültige E-Mail-Adresse ein.",
    },
    min: {
      test: (v, a) => v === "" || v.length >= Number(a),
      msg: (a) => `Mindestens ${a} Zeichen erforderlich.`,
    },
    max: {
      test: (v, a) => v.length <= Number(a),
      msg: (a) => `Höchstens ${a} Zeichen erlaubt.`,
    },
    alphanum: {
      test: (v) => v === "" || /^[a-zA-Z0-9_]+$/.test(v),
      msg: () => "Nur Buchstaben, Zahlen und _ erlaubt.",
    },
    strongpw: {
      // at least 8 chars, one letter, one number
      test: (v) => v === "" || (/[A-Za-z]/.test(v) && /\d/.test(v) && v.length >= 8),
      msg: () => "Min. 8 Zeichen mit Buchstabe und Zahl.",
    },
    match: {
      test: (v, a, form) => {
        const other = form.querySelector(`[name="${a}"]`);
        return other ? v === other.value : true;
      },
      msg: () => "Die Eingaben stimmen nicht überein.",
    },
    checked: {
      test: (v, a, form, el) => el.checked,
      msg: () => "Bitte bestätige, um fortzufahren.",
    },
  };

  /* --- Password strength scorer (0..4) --- */
  function scorePassword(v) {
    let s = 0;
    if (!v) return 0;
    if (v.length >= 8) s++;
    if (v.length >= 12) s++;
    if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
    if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) s++;
    return Math.min(s, 4);
  }
  const STRENGTH = [
    { label: "", color: "" },
    { label: "Schwach", color: "#e74c3c" },
    { label: "Okay", color: "#fdcb6e" },
    { label: "Gut", color: "#00b894" },
    { label: "Stark", color: "#00d2ff" },
  ];

  function parseRules(str) {
    return (str || "")
      .split("|")
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => {
        const [name, arg] = r.split(":");
        return { name, arg };
      });
  }

  function fieldOf(el) {
    return el.closest(".field");
  }

  /* Validate a single element. Returns first error message or "". */
  function validateField(el, form) {
    const rules = parseRules(el.dataset.rules);
    const value = el.value;
    for (const { name, arg } of rules) {
      const rule = RULES[name];
      if (!rule) continue;
      if (!rule.test(value, arg, form, el)) {
        return typeof rule.msg === "function" ? rule.msg(arg) : rule.msg;
      }
    }
    return "";
  }

  function setFieldState(el, error) {
    const field = fieldOf(el);
    if (!field) return;
    const msg = field.querySelector(".field-msg");
    const touched = el.dataset.touched === "1";
    field.classList.remove("is-valid", "is-invalid");
    if (error) {
      if (touched) field.classList.add("is-invalid");
      if (msg) msg.textContent = error;
    } else if (el.value.trim() !== "" && parseRules(el.dataset.rules).length) {
      field.classList.add("is-valid");
      if (msg) msg.textContent = "";
    }
  }

  function bindStrengthMeter(el) {
    const field = fieldOf(el);
    const meter = field && field.querySelector(".pw-meter");
    if (!meter) return;
    const label = field.querySelector(".pw-label");
    el.addEventListener("input", () => {
      const score = scorePassword(el.value);
      meter.dataset.score = String(score);
      meter.style.setProperty("--lvl", STRENGTH[score].color || "var(--brand)");
      if (label) label.textContent = el.value ? `Passwortstärke: ${STRENGTH[score].label}` : "";
    });
  }

  /* Attach the rule engine to a <form>. Returns a controller. */
  function attach(form, opts = {}) {
    const els = Array.from(form.querySelectorAll("[data-rules]"));

    els.forEach((el) => {
      if (el.type === "password") bindStrengthMeter(el);
      const live = () => {
        setFieldState(el, validateField(el, form));
      };
      el.addEventListener("blur", () => {
        el.dataset.touched = "1";
        live();
      });
      el.addEventListener("input", () => {
        if (el.dataset.touched === "1") live();
        // re-check confirm field when source changes
        const confirmEl = form.querySelector(`[data-rules*="match:${el.name}"]`);
        if (confirmEl && confirmEl.dataset.touched === "1") {
          setFieldState(confirmEl, validateField(confirmEl, form));
        }
      });
    });

    function validateAll() {
      let ok = true;
      let firstBad = null;
      els.forEach((el) => {
        el.dataset.touched = "1";
        const err = validateField(el, form);
        setFieldState(el, err);
        if (err) {
          ok = false;
          const field = fieldOf(el);
          if (field) {
            field.classList.add("shake");
            setTimeout(() => field.classList.remove("shake"), 450);
          }
          if (!firstBad) firstBad = el;
        }
      });
      if (firstBad) firstBad.focus();
      return ok;
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (validateAll() && typeof opts.onValid === "function") {
        const data = Object.fromEntries(new FormData(form).entries());
        opts.onValid(data, form);
      }
    });

    return { validateAll, scorePassword };
  }

  global.LumoValidate = { attach, RULES, scorePassword, validateField };
})(window);
