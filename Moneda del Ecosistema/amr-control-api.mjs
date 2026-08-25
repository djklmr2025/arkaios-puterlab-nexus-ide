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
