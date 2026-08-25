# 🪙 ARKAIOS AMR Token & Real Wallet Ecosystem Standard

**Versión**: 1.0.0  
**Fecha de Emisión**: 2026-08-25  
**Ubicación Principal**: `C:\ARKAIOS\AMR_ECOSYSTEM_README.md`  
**Ubicación SDK Cartera**: `C:\ARKAIOS\Puter-Lab-Nexus-IDE-main\assets\amr-wallet.js`

---

## 📌 1. Definición del Token AMR (Arkaios Memory Resource)

**AMR (Arkaios Memory Resource)** es la criptomoneda y token de utilidad nativo de la plataforma **ARKAIOS AI Ecosystem**. Sirve como unidad de intercambio y liquidación para:

1. **Créditos de Cómputo y Servidores**: Pago por despliegue de proyectos en **Puter Cloud**, **Vercel** y ejecuciones pesadas en **Render Workers**.
2. **Consumo de Inferencia de IA**: Cuota para invocar modelos como **Gemini 1.5 Pro / Flash**, **Puter AI**, **Claude 3.5 Sonnet** y **GPT-4o**.
3. **Identidad Criptográfica y Licencias**: Vinculado al HWID único del equipo del usuario, a las licencias `TARJETA_ARK_*.arkaios` y a cuentas verificadas en Google Auth (`arkaios-world`).
4. **Almacenamiento Persistente en la Nube**: Espacio de archivos en `puter.fs` y Firestore.

---

## 🛠️ 2. Arquitectura de Control y APIs (`Servidor_Arkaios_API`)

El ecosistema ARKAIOS opera una infraestructura híbrida para la gestión y liquidación del token AMR a través del Servidor de Control API:

### 📡 Endpoints de la API de Control AMR (`Servidor_Arkaios_API / Vercel`)

| Endpoint | Método | Descripción | Parámetros / Body |
| --- | --- | --- | --- |
| `/api/amr/balance` | `GET` | Consulta el saldo disponible del usuario en tiempo real. | `?address=amr_username` |
| `/api/amr/transfer` | `POST` | Ejecuta una transferencia de tokens AMR entre carteras. | `{ "from": "amr_user1", "to": "amr_user2", "amount": 50.00 }` |
| `/api/amr/pay` | `POST` | Descuenta tokens por uso de hosting, cómputo o IA. | `{ "address": "amr_user", "amount": 10.00, "concept": "Deploy Puter" }` |
| `/api/amr/mint` | `POST` | Bonifica tokens por donación de cómputo o creación de repos. | `{ "address": "amr_user", "amount": 25.00, "reason": "Reward" }` |
| `/api/amr/verify-card` | `POST` | Valida la firma de tarjetas criptográficas `.arkaios`. | `{ "cardPayload": "U2FsdGVkX1..." }` |

---

## 🔌 3. Módulo SDK de Cartera Real (`AMRWalletConnector`)

El SDK de la Cartera Real está integrado en:
[`C:\ARKAIOS\Puter-Lab-Nexus-IDE-main\assets\amr-wallet.js`](file:///C:/ARKAIOS/Puter-Lab-Nexus-IDE-main/assets/amr-wallet.js)

### 💻 Ejemplo de Integración en 3 Líneas de Código (Web App / HTML)

```html
<!-- 1. Importar el SDK de Cartera Real AMR -->
<script src="assets/amr-wallet.js"></script>

<!-- 2. Contenedor del Widget de Cartera (Opcional) -->
<div id="amrWalletWidget"></div>

<script>
  document.addEventListener('DOMContentLoaded', async () => {
    // 3. Conectar la Cartera Real del Usuario
    const wallet = new AMRWalletConnector();
    await wallet.connect();
    
    // Renderizar el Widget UI de Saldo
    wallet.renderWidget('amrWalletWidget');
    
    console.log("Dirección Cartera:", wallet.address);
    console.log("Saldo AMR Disponible:", wallet.balance);
  });
</script>
```

---

## 🚀 4. Integración en los Proyectos del Ecosistema

### 🚀 **PuterLab Nexus IDE & Deploy Hub** (`deploy-hub.html`):
- Los despliegues automáticos bonifican **+25.00 AMR** al usuario.
- La ejecución de consultas al **Agente Experto en Despliegues** consume **1.50 AMR** por inferencia.

### 🌐 **Cosmos Den & Arkaios Expo**:
- Las aplicaciones públicas aceptan propinas o micropagos en tokens AMR.

### 🤖 **Elemia AI & DJ Assistant**:
- Verificación del saldo AMR para habilitar funciones exclusivas MODO DIOS / OWNER.
