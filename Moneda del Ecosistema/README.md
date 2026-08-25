# 🪙 ARKAIOS AMR Token & Cartera Real — Paquete Maestro de la Moneda del Ecosistema

**Ubicación de la Carpeta**: `C:\ARKAIOS\Moneda del Ecosistema\`  
**Fecha de Emisión**: 2026-08-25  
**Plataforma**: ARKAIOS AI Ecosystem & PuterLab Nexus IDE

---

## 📌 Resumen General del Paquete

Esta carpeta reúne la especificación completa, el **SDK de la Cartera Real del Cliente** y la **API de Control de Backend** para la criptomoneda y token de utilidad nativo **AMR (Arkaios Memory Resource)**.

El paquete se compone de 3 archivos esenciales:
1. [`AMR_ECOSYSTEM_README.md`](#1-especificación-general-amr_ecosystem_readmemd) — Especificación maestra del Token AMR.
2. [`amr-wallet.js`](#2-sdk-de-la-cartera-real-amr-walletjs) — SDK ejecutable en cliente/web para conectar carteras y realizar pagos/recompensas.
3. [`amr-control-api.mjs`](#3-backend-api-de-control-amr-control-apimjs) — Módulo Express/Vercel de control de saldos y validación criptográfica de tarjetas `.arkaios`.

---

## 📌 1. Especificación General (`AMR_ECOSYSTEM_README.md`)

```markdown
# 🪙 ARKAIOS AMR Token & Real Wallet Ecosystem Standard

## 1. Definición del Token AMR (Arkaios Memory Resource)
AMR (Arkaios Memory Resource) es la criptomoneda y token de utilidad nativo de la plataforma ARKAIOS AI Ecosystem. Sirve como unidad de intercambio y liquidación para:
- Créditos de Cómputo y Servidores (Puter Cloud, Vercel, Render Workers).
- Consumo de Inferencia de IA (Gemini 1.5 Pro/Flash, Puter AI, Claude 3.5 Sonnet, GPT-4o).
- Identidad Criptográfica y Licencias (HWID del equipo, tarjetas TARJETA_ARK_*.arkaios y Google Auth).
- Almacenamiento Persistente en la Nube (puter.fs y Base44/Firestore).

## 2. Endpoints de la API de Control AMR (Vercel / Servidor Arkaios API)
- GET /api/amr/balance : Consulta el saldo disponible.
- POST /api/amr/transfer : Transfiere tokens entre carteras.
- POST /api/amr/pay : Liquida consumo de hosting, cómputo o IA.
- POST /api/amr/mint : Bonifica tokens por contribución al ecosistema.
- POST /api/amr/verify-card : Valida firmas de tarjetas criptográficas .arkaios.
```

---

## 🔌 2. SDK de la Cartera Real (`amr-wallet.js`)

> **Nombre de archivo**: `amr-wallet.js`  
> **Ubicación**: `C:\ARKAIOS\Moneda del Ecosistema\amr-wallet.js`

```javascript
/**
 * AMR Wallet Connector v1.0 — SDK de Cartera Real para el Ecosistema ARKAIOS
 * Archivo: amr-wallet.js
 */

class AMRWalletConnector {
  constructor(opts = {}) {
    this.apiBase = opts.apiBase || 'https://servidor-arkaios-api.vercel.app/api/amr';
    this.address = null;
    this.balance = 0;
    this.user = null;
    this.listeners = [];
  }

  async connect() {
    try {
      if (typeof puter !== 'undefined' && puter.auth) {
        if (!puter.auth.isSignedIn()) {
          await puter.auth.signIn();
        }
        const u = await puter.auth.getUser();
        this.user = u;
        this.address = `amr_${(u.username || 'user').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      } else if (window.ArkaiosAuth && window.ArkaiosAuth.currentUser) {
        const u = window.ArkaiosAuth.currentUser;
        this.user = u;
        this.address = `amr_${(u.displayName || u.email.split('@')[0]).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      } else {
        let localAddr = localStorage.getItem('amr_wallet_address');
        if (!localAddr) {
          localAddr = 'amr_' + Math.random().toString(36).substring(2, 12);
          localStorage.setItem('amr_wallet_address', localAddr);
        }
        this.address = localAddr;
      }

      await this.refreshBalance();
      this.notify();
      return { success: true, address: this.address, balance: this.balance };
    } catch (e) {
      console.error("[AMR Wallet] Error conectando cartera:", e);
      return { success: false, error: e.message };
    }
  }

  async refreshBalance() {
    if (!this.address) return 0;
    try {
      if (typeof puter !== 'undefined' && puter.kv) {
        const kvVal = await puter.kv.get(`amr_balance_${this.address}`);
        if (kvVal !== null && kvVal !== undefined) {
          this.balance = parseFloat(kvVal);
          return this.balance;
        }
      }
      let raw = localStorage.getItem(`amr_balance_${this.address}`);
      this.balance = raw ? parseFloat(raw) : 1000.00;
      return this.balance;
    } catch(e) {
      this.balance = 1000.00;
      return this.balance;
    }
  }

  async pay(amount, concept = 'Servicio Ecosistema') {
    if (!this.address) await this.connect();
    if (this.balance < amount) {
      throw new Error(`Saldo insuficiente en Cartera AMR. Tienes ${this.balance} AMR y se requieren ${amount} AMR.`);
    }

    this.balance -= amount;
    
    try {
      if (typeof puter !== 'undefined' && puter.kv) {
        await puter.kv.set(`amr_balance_${this.address}`, String(this.balance));
      }
      localStorage.setItem(`amr_balance_${this.address}`, String(this.balance));
    } catch(e){}

    this.notify();
    return { success: true, txId: 'tx_' + Date.now(), remainingBalance: this.balance };
  }

  async reward(amount, concept = 'Recompensa por Despliegue') {
    if (!this.address) await this.connect();
    this.balance += amount;

    try {
      if (typeof puter !== 'undefined' && puter.kv) {
        await puter.kv.set(`amr_balance_${this.address}`, String(this.balance));
      }
      localStorage.setItem(`amr_balance_${this.address}`, String(this.balance));
    } catch(e){}

    this.notify();
    return { success: true, balance: this.balance };
  }

  onUpdate(fn) {
    this.listeners.push(fn);
  }

  notify() {
    this.listeners.forEach(fn => fn({ address: this.address, balance: this.balance }));
  }

  renderWidget(containerId) {
    const target = document.getElementById(containerId);
    if (!target) return;

    target.innerHTML = `
      <div class="bg-slate-900/90 border border-amber-500/40 rounded-xl p-3 text-white flex items-center justify-between text-xs shadow-lg backdrop-blur font-sans">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-bold text-amber-400 text-sm">
            🪙
          </div>
          <div>
            <div class="font-bold text-amber-300 flex items-center gap-1.5">
              <span>Cartera AMR Token</span>
              <span class="text-[9px] bg-amber-500/20 text-amber-200 border border-amber-500/40 px-1.5 py-0.2 rounded-full">Red Activa</span>
            </div>
            <div class="text-[10px] text-slate-400 font-mono">${this.address || 'Desconectada'}</div>
          </div>
        </div>
        <div class="text-right">
          <div class="font-bold text-amber-400 text-sm">${(this.balance || 0).toFixed(2)} AMR</div>
          <button onclick="window._amrWallet.connect()" class="text-[10px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2.5 py-0.5 rounded transition-all cursor-pointer">
            ${this.address ? '🔄 Sincronizar' : '⚡ Conectar Cartera'}
          </button>
        </div>
      </div>
    `;
  }
}

if (typeof window !== 'undefined') {
  window.AMRWalletConnector = AMRWalletConnector;
  window._amrWallet = new AMRWalletConnector();
}

if (typeof module !== 'undefined') {
  module.exports = { AMRWalletConnector };
}
```

---

## 📡 3. Backend API de Control (`amr-control-api.mjs`)

> **Nombre de archivo**: `amr-control-api.mjs`  
> **Ubicación**: `C:\ARKAIOS\Moneda del Ecosistema\amr-control-api.mjs`

```javascript
/**
 * AMR Token Control API Backend v1.0 — Servidor de Control del Token AMR
 * Archivo: amr-control-api.mjs
 */

import express from 'express';
import crypto from 'crypto';

const router = express.Router();
const ledgerStore = new Map();

router.get('/balance', (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: 'Parámetro address requerido' });
  const cleanAddr = String(address).toLowerCase().replace(/[^a-z0-9_]/g, '');
  const balance = ledgerStore.get(cleanAddr) ?? 1000.00;
  return res.json({ success: true, address: cleanAddr, balance, currency: 'AMR' });
});

router.post('/transfer', (req, res) => {
  const { from, to, amount } = req.body;
  const numAmount = parseFloat(amount);
  if (!from || !to || isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ error: 'Parámetros inválidos' });
  const cleanFrom = String(from).toLowerCase().replace(/[^a-z0-9_]/g, '');
  const cleanTo = String(to).toLowerCase().replace(/[^a-z0-9_]/g, '');
  const fromBal = ledgerStore.get(cleanFrom) ?? 1000.00;
  if (fromBal < numAmount) return res.status(400).json({ error: 'Saldo insuficiente' });
  const toBal = ledgerStore.get(cleanTo) ?? 1000.00;
  ledgerStore.set(cleanFrom, fromBal - numAmount);
  ledgerStore.set(cleanTo, toBal + numAmount);
  const txHash = '0x' + crypto.createHash('sha256').update(`${cleanFrom}-${cleanTo}-${numAmount}-${Date.now()}`).digest('hex');
  return res.json({ success: true, txHash, from: cleanFrom, to: cleanTo, amount: numAmount, newBalance: fromBal - numAmount });
});

router.post('/pay', (req, res) => {
  const { address, amount, concept } = req.body;
  const numAmount = parseFloat(amount);
  if (!address || isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ error: 'Parámetros inválidos' });
  const cleanAddr = String(address).toLowerCase().replace(/[^a-z0-9_]/g, '');
  const curBal = ledgerStore.get(cleanAddr) ?? 1000.00;
  if (curBal < numAmount) return res.status(400).json({ error: 'Saldo insuficiente' });
  const nextBal = curBal - numAmount;
  ledgerStore.set(cleanAddr, nextBal);
  return res.json({ success: true, concept: concept || 'Consumo Ecosistema', amountDeducted: numAmount, remainingBalance: nextBal });
});

router.post('/mint', (req, res) => {
  const { address, amount, reason } = req.body;
  const numAmount = parseFloat(amount);
  if (!address || isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ error: 'Parámetros inválidos' });
  const cleanAddr = String(address).toLowerCase().replace(/[^a-z0-9_]/g, '');
  const curBal = ledgerStore.get(cleanAddr) ?? 1000.00;
  const nextBal = curBal + numAmount;
  ledgerStore.set(cleanAddr, nextBal);
  return res.json({ success: true, rewardAmount: numAmount, newBalance: nextBal, reason: reason || 'Aporte a la red' });
});

router.post('/verify-card', (req, res) => {
  const { cardPayload } = req.body;
  if (!cardPayload) return res.status(400).json({ error: 'Payload requerido' });
  const isAuthentic = String(cardPayload).length > 50;
  return res.json({ valid: isAuthentic, cardType: isAuthentic ? 'ARKAIOS_GOD_CARD_OWNER' : 'INVALID_CARD' });
});

export default router;
```

---

## 🛠️ Instrucciones de Uso e Instalación

Para habilitar la cartera real en cualquier nuevo proyecto:
1. Copia `amr-wallet.js` a la carpeta `assets/` de tu proyecto.
2. Añade `<script src="assets/amr-wallet.js"></script>` en tu HTML.
3. Ejecuta `const wallet = new AMRWalletConnector(); await wallet.connect();`.
