// deploy-to-puter.js — Script para desplegar PuterLab Nexus IDE en Puter Hosting (Dominio .puter.site)

export async function deployToPuterHosting(subdomain = 'puterlab-ide') {
  if (typeof puter === 'undefined' || !puter.hosting) {
    throw new Error('La API de Puter Hosting no está disponible. Inicia sesión en Puter primero.');
  }
  try {
    const site = await puter.hosting.create(subdomain, '.');
    return {
      success: true,
      url: `https://${site.subdomain}.puter.site`,
      site
    };
  } catch (e) {
    return {
      success: false,
      error: e.message || String(e)
    };
  }
}
