/**
 * Reelo website lead-capture widget (Phase 13).
 *
 * Embedded with: <script src=".../reelo-widget.js" data-widget="KEY" async></script>
 *
 * Deliberately vanilla, dependency-free JS — a business's website has no
 * guarantee of a particular framework, so this can't assume one. It never
 * identifies a visitor secretly: nothing runs until they click the button,
 * and nothing is submitted until they fill in the form themselves and hit
 * send (see the Phase 13 spec's core "voluntary lead capture" principle).
 */
(function () {
  "use strict";

  var currentScript = document.currentScript;
  if (!currentScript) return;

  var widgetKey = currentScript.getAttribute("data-widget");
  if (!widgetKey) {
    console.warn("[reelo-widget] Missing data-widget attribute — the form will not be shown.");
    return;
  }

  // Derive the API origin from where this script itself was loaded from,
  // so the same snippet works whether the business copies it from a
  // staging or production Reelo instance — never hardcoded.
  var scriptUrl = new URL(currentScript.src, window.location.href);
  var apiOrigin = scriptUrl.origin;

  var STYLE_ID = "reelo-widget-style";
  var STATE = { config: null, submitting: false, submitted: false };

  function injectStyles(accentColor) {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      ".reelo-widget-btn{position:fixed;bottom:20px;right:20px;z-index:2147483000;" +
      "background:" + accentColor + ";color:#fff;border:none;border-radius:999px;" +
      "padding:12px 20px;font:600 14px/1.2 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;" +
      "box-shadow:0 4px 14px rgba(0,0,0,.2);cursor:pointer;}" +
      ".reelo-widget-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);" +
      "z-index:2147483001;display:flex;align-items:flex-end;justify-content:center;}" +
      "@media (min-width:640px){.reelo-widget-overlay{align-items:center;}}" +
      ".reelo-widget-panel{background:#fff;width:100%;max-width:380px;border-radius:16px 16px 0 0;" +
      "padding:20px;font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;" +
      "max-height:90vh;overflow-y:auto;box-sizing:border-box;}" +
      "@media (min-width:640px){.reelo-widget-panel{border-radius:16px;}}" +
      ".reelo-widget-panel h3{margin:0 0 4px;font-size:16px;}" +
      ".reelo-widget-panel p{margin:0 0 14px;color:#475569;font-size:13px;}" +
      ".reelo-widget-field{margin-bottom:10px;}" +
      ".reelo-widget-field label{display:block;font-size:12px;font-weight:600;color:#334155;margin-bottom:4px;}" +
      ".reelo-widget-field input,.reelo-widget-field select,.reelo-widget-field textarea{" +
      "width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;}" +
      ".reelo-widget-consent{font-size:11px;color:#64748b;margin:10px 0;}" +
      ".reelo-widget-actions{display:flex;gap:8px;margin-top:14px;}" +
      ".reelo-widget-submit{flex:1;background:" + accentColor + ";color:#fff;border:none;border-radius:8px;" +
      "padding:11px;font-weight:600;font-size:14px;cursor:pointer;}" +
      ".reelo-widget-submit:disabled{opacity:.6;cursor:default;}" +
      ".reelo-widget-cancel{background:none;border:none;color:#64748b;font-size:13px;cursor:pointer;padding:11px;}" +
      ".reelo-widget-error{color:#dc2626;font-size:12px;margin-top:8px;}" +
      ".reelo-widget-success{text-align:center;padding:12px 0;}" +
      ".reelo-widget-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;}";
    document.head.appendChild(style);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    for (var key in attrs || {}) {
      if (key === "text") node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    }
    (children || []).forEach(function (child) {
      node.appendChild(child);
    });
    return node;
  }

  function openForm(config) {
    var overlay = el("div", { class: "reelo-widget-overlay" });
    var panel = el("div", { class: "reelo-widget-panel" });

    function renderForm() {
      panel.innerHTML = "";
      panel.appendChild(el("h3", { text: config.businessName }));
      if (config.introText) panel.appendChild(el("p", { text: config.introText }));

      var form = el("form");

      var nameField = el("div", { class: "reelo-widget-field" }, [
        el("label", { text: "Your name" }),
        el("input", { type: "text", name: "name", maxlength: "120" }),
      ]);
      var phoneField = el("div", { class: "reelo-widget-field" }, [
        el("label", { text: "WhatsApp number" }),
        el("input", { type: "tel", name: "phone", required: "required", maxlength: "15", placeholder: "10-digit mobile number" }),
      ]);
      form.appendChild(nameField);
      form.appendChild(phoneField);

      if (config.interestOptions && config.interestOptions.length > 0) {
        var select = el("select", { name: "interest" }, [el("option", { value: "", text: "What are you interested in?" })]);
        config.interestOptions.forEach(function (opt) {
          select.appendChild(el("option", { value: opt, text: opt }));
        });
        form.appendChild(el("div", { class: "reelo-widget-field" }, [el("label", { text: "Interested in" }), select]));
      }

      form.appendChild(
        el("div", { class: "reelo-widget-field" }, [
          el("label", { text: "Anything else? (optional)" }),
          el("textarea", { name: "message", rows: "2", maxlength: "1000" }),
        ])
      );

      // Honeypot — invisible to a real visitor, often filled by bots.
      form.appendChild(
        el("div", { class: "reelo-widget-hp", "aria-hidden": "true" }, [
          el("label", { text: "Website" }),
          el("input", { type: "text", name: "website", tabindex: "-1", autocomplete: "off" }),
        ])
      );

      var consentLabel = el("label", { class: "reelo-widget-consent" });
      var consentCheckbox = el("input", { type: "checkbox", name: "consent", required: "required" });
      consentLabel.appendChild(consentCheckbox);
      consentLabel.appendChild(document.createTextNode(" " + config.consentText));
      form.appendChild(consentLabel);

      var errorEl = el("div", { class: "reelo-widget-error", style: "display:none" });
      form.appendChild(errorEl);

      var actions = el("div", { class: "reelo-widget-actions" });
      var cancelBtn = el("button", { type: "button", class: "reelo-widget-cancel", text: "Cancel" });
      var submitBtn = el("button", { type: "submit", class: "reelo-widget-submit", text: config.buttonText });
      actions.appendChild(cancelBtn);
      actions.appendChild(submitBtn);
      form.appendChild(actions);

      cancelBtn.addEventListener("click", function () {
        document.body.removeChild(overlay);
      });

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (STATE.submitting) return;
        STATE.submitting = true;
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending...";
        errorEl.style.display = "none";

        var formData = new FormData(form);
        var payload = {
          widgetKey: widgetKey,
          name: formData.get("name") || undefined,
          phone: formData.get("phone") || undefined,
          interest: formData.get("interest") || undefined,
          message: formData.get("message") || undefined,
          source: config.defaultSource,
          sourceUrl: window.location.href,
          consentGiven: formData.get("consent") === "on",
          website: formData.get("website") || "",
        };

        fetch(apiOrigin + "/api/leads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
          .then(function (res) {
            return res.json().then(function (json) {
              return { ok: res.ok && json.ok, error: json.error };
            });
          })
          .then(function (result) {
            STATE.submitting = false;
            submitBtn.disabled = false;
            submitBtn.textContent = config.buttonText;
            if (!result.ok) {
              errorEl.textContent = result.error || "Something went wrong. Please try again.";
              errorEl.style.display = "block";
              return;
            }
            renderSuccess();
          })
          .catch(function () {
            STATE.submitting = false;
            submitBtn.disabled = false;
            submitBtn.textContent = config.buttonText;
            errorEl.textContent = "Something went wrong. Please try again.";
            errorEl.style.display = "block";
          });
      });

      panel.appendChild(form);
    }

    function renderSuccess() {
      panel.innerHTML = "";
      // Deliberately says the REQUEST was received — never that a WhatsApp
      // message has already been sent, since sending is a separate,
      // owner-initiated step later (Phase 13 spec step 31).
      panel.appendChild(
        el("div", { class: "reelo-widget-success" }, [
          el("h3", { text: "Thanks!" }),
          el("p", { text: "Your request was received. " + config.businessName + " will reach out to you on WhatsApp shortly." }),
          el("button", { type: "button", class: "reelo-widget-submit", text: "Close" }),
        ])
      );
      panel.querySelector("button").addEventListener("click", function () {
        document.body.removeChild(overlay);
      });
    }

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    renderForm();
  }

  function init(config) {
    injectStyles(config.accentColor || "#16a34a");
    var button = el("button", { class: "reelo-widget-btn", type: "button", text: config.buttonText });
    button.addEventListener("click", function () {
      openForm(config);
    });
    document.body.appendChild(button);
  }

  function boot() {
    fetch(apiOrigin + "/api/widget/" + encodeURIComponent(widgetKey))
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        if (!json.ok) return; // unknown/inactive widget — show nothing, no error exposed to the visitor
        STATE.config = json.data;
        init(json.data);
      })
      .catch(function () {
        // Network error — fail silently rather than showing a broken
        // button on the business's site.
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
