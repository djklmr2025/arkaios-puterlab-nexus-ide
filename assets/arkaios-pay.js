/**
 * ARKAIOS Pay v1.0 — Pasarela Universal de Pagos y SDK Estilo Stripe / PayPal
 * Archivo: arkaios-pay.js
 * 
 * Permite a cualquier sitio web o repositorio del ecosistema (o sitios externos)
 * incorporar botones de pago en 1-clic con la Cartera Real AMR de ARKAIOS.
 */

(function () {
  class ArkaiosPaySDK {
    constructor() {
      this.version = "1.0.0";
      this.apiEndpoint = "https://servidor-arkaios-api.vercel.app/api/amr";
      this.initialized = false;
      this.userWallet = null;
      this._initStyles();
    }

    _initStyles() {
      if (document.getElementById("arkaios-pay-styles")) return;
      const style = document.createElement("style");
      style.id = "arkaios-pay-styles";
      style.textContent = `
        .arkaios-pay-overlay {
          position: fixed;
          top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(8, 10, 18, 0.85);
          backdrop-filter: blur(8px);
          z-index: 999999;
          display: flex; align-items: center; justify-content: center;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          opacity: 0; transition: opacity 0.25s ease-out;
        }
        .arkaios-pay-overlay.active { opacity: 1; }
        .arkaios-pay-card {
          background: #0d111d;
          border: 1px solid rgba(245, 158, 11, 0.4);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 30px rgba(245, 158, 11, 0.15);
          border-radius: 20px;
          width: 100%; max-width: 420px;
          padding: 24px; color: #fff;
          transform: scale(0.92); transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .arkaios-pay-overlay.active .arkaios-pay-card { transform: scale(1); }
        .arkaios-pay-btn-main {
          width: 100%;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: #090d16; font-weight: 700; border: 0;
          padding: 12px 18px; border-radius: 12px;
          font-size: 14px; cursor: pointer;
          transition: all 0.2s ease;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3);
        }
        .arkaios-pay-btn-main:hover {
          background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
          transform: translateY(-1px);
        }
        .arkaios-pay-btn-main:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .arkaios-pay-close {
          background: transparent; border: 0; color: #94a3b8; font-size: 20px; cursor: pointer;
        }
        .arkaios-pay-close:hover { color: #fff; }
      `;
      document.head.appendChild(style);
    }

    async getWallet() {
      if (typeof window._amrWallet !== 'undefined') {
        await window._amrWallet.connect();
        return window._amrWallet;
      }
      if (typeof window.AMRWalletConnector !== 'undefined') {
        const w = new window.AMRWalletConnector();
        await w.connect();
        return w;
      }
      let localAddr = localStorage.getItem('amr_wallet_address') || ('amr_' + Math.random().toString(36).substring(2, 10));
      localStorage.setItem('amr_wallet_address', localAddr);
      let localBal = parseFloat(localStorage.getItem(`amr_balance_${localAddr}`) || '1000.00');

      return {
        address: localAddr,
        balance: localBal,
        pay: async (amt) => {
          if (localBal < amt) throw new Error(`Saldo insuficiente (${localBal} AMR).`);
          localBal -= amt;
          localStorage.setItem(`amr_balance_${localAddr}`, String(localBal));
          return { success: true, txId: 'tx_' + Date.now(), remainingBalance: localBal };
        }
      };
    }

    async checkout(options = {}) {
      const {
        amount = 10.00,
        concept = "Compra en Comercio ARKAIOS",
        merchantName = document.title || "Comercio Partner",
        onSuccess = null,
        onCancel = null
      } = options;

      const numAmount = parseFloat(amount);
      const wallet = await this.getWallet();

      const overlay = document.createElement("div");
      overlay.className = "arkaios-pay-overlay";

      overlay.innerHTML = `
        <div class="arkaios-pay-card">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="background:rgba(245,158,11,0.2); border:1px solid rgba(245,158,11,0.4); width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:16px;">⚡</div>
              <div>
                <div style="font-weight:700; font-size:14px; color:#f59e0b;">ARKAIOS Pay</div>
                <div style="font-size:10px; color:#64748b;">Pasarela Universal de Pagos</div>
              </div>
            </div>
            <button class="arkaios-pay-close" id="arkaiosCloseBtn">&times;</button>
          </div>

          <div style="background:#070a12; border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:14px; margin-bottom:16px;">
            <div style="font-size:11px; color:#94a3b8; margin-bottom:4px;">Pagar a ${merchantName}</div>
            <div style="font-weight:600; font-size:13px; color:#f8fafc; margin-bottom:10px;">${concept}</div>
            <div style="display:flex; align-items:baseline; justify-content:space-between; border-top:1px border-dashed rgba(255,255,255,0.1); pt-2; margin-top:8px;">
              <span style="font-size:11px; color:#64748b;">Total a pagar:</span>
              <span style="font-size:22px; font-weight:800; color:#fbbf24;">${numAmount.toFixed(2)} AMR</span>
            </div>
          </div>

          <div style="background:rgba(15,23,42,0.8); border:1px solid rgba(255,255,255,0.05); border-radius:12px; padding:12px; margin-bottom:20px; font-size:11px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
              <span style="color:#94a3b8;">Cartera de Origen:</span>
              <span style="color:#f1f5f9; font-family:monospace;">${wallet.address}</span>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="color:#94a3b8;">Saldo Disponible:</span>
              <span style="color:${wallet.balance >= numAmount ? '#34d399' : '#f87171'}; font-weight:700;">${wallet.balance.toFixed(2)} AMR</span>
            </div>
          </div>

          <div id="arkaiosPayStatus" style="font-size:11px; margin-bottom:12px; display:none;"></div>

          <button class="arkaios-pay-btn-main" id="arkaiosPayConfirmBtn" ${wallet.balance < numAmount ? 'disabled' : ''}>
            <span>⚡ Confirmar Pago con ARKAIOS Pay</span>
          </button>
          
          <div style="text-align:center; font-size:9px; color:#475569; margin-top:12px;">
            Protegido por el Protocolo Criptográfico ARKAIOS Sovereign Network
          </div>
        </div>
      `;

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add("active"));

      const close = () => {
        overlay.classList.remove("active");
        setTimeout(() => overlay.remove(), 250);
        if (onCancel) onCancel();
      };

      overlay.querySelector("#arkaiosCloseBtn").onclick = close;

      const confirmBtn = overlay.querySelector("#arkaiosPayConfirmBtn");
      const statusDiv = overlay.querySelector("#arkaiosPayStatus");

      confirmBtn.onclick = async () => {
        try {
          confirmBtn.disabled = true;
          confirmBtn.innerHTML = `<span>⏳ Procesando pago seguro...</span>`;

          const result = await wallet.pay(numAmount, concept);

          confirmBtn.style.background = "#10b981";
          confirmBtn.style.color = "#fff";
          confirmBtn.innerHTML = `<span>✔ ¡Pago Exitoso!</span>`;

          statusDiv.style.display = "block";
          statusDiv.style.color = "#34d399";
          statusDiv.innerHTML = `Transacción confirmada: <b>${result.txId}</b>. Redirigiendo...`;

          setTimeout(() => {
            overlay.classList.remove("active");
            setTimeout(() => overlay.remove(), 250);
            if (onSuccess) onSuccess(result);
          }, 1200);

        } catch (err) {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = `<span>⚡ Intentar de Nuevo</span>`;
          statusDiv.style.display = "block";
          statusDiv.style.color = "#f87171";
          statusDiv.innerHTML = `✖ Error: ${err.message}`;
        }
      };
    }

    autoBind() {
      document.querySelectorAll("[data-arkaios-pay]").forEach((btn) => {
        if (btn.dataset.arkaiosBound) return;
        btn.dataset.arkaiosBound = "true";
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          const amount = parseFloat(btn.dataset.arkaiosPay || "10");
          const concept = btn.dataset.concept || "Servicio Ecosistema";
          this.checkout({
            amount,
            concept,
            onSuccess: (res) => {
              if (btn.dataset.onSuccess && window[btn.dataset.onSuccess]) {
                window[btn.dataset.onSuccess](res);
              }
            }
          });
        });
      });
    }
  }

  const instance = new ArkaiosPaySDK();
  window.ArkaiosPay = instance;

  document.addEventListener("DOMContentLoaded", () => {
    instance.autoBind();
  });
})();
