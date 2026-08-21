// github-storage.js — Almacenamiento Ilimitado y Persistente de Proyectos usando la API de GitHub (Estilo Morejust.store)

export class GitHubVaultStorage {
  constructor(token = null) {
    this.token = token;
    this.baseUrl = 'https://api.github.com';
  }

  setToken(token) {
    this.token = token;
  }

  // Guardar un proyecto completo como commit en GitHub
  async commitProject(owner, repo, projectName, filesMap, commitMessage = "Deploy desde PuterLab IDE") {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };
    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }

    try {
      for (const [filePath, content] of Object.entries(filesMap)) {
        const fullPath = `${projectName}/${filePath}`.replace(/\/+/g, '/');
        const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${fullPath}`;
        
        // Check if file exists to get SHA
        let sha = null;
        try {
          const getRes = await fetch(url, { headers });
          if (getRes.ok) {
            const data = await getRes.json();
            sha = data.sha;
          }
        } catch(e){}

        const body = {
          message: `${commitMessage}: ${filePath}`,
          content: btoa(unescape(encodeURIComponent(content))),
          branch: 'main'
        };
        if (sha) body.sha = sha;

        await fetch(url, {
          method: 'PUT',
          headers,
          body: JSON.stringify(body)
        });
      }
      return { success: true, message: `Proyecto '${projectName}' respaldado exitosamente en GitHub (${owner}/${repo})` };
    } catch(err) {
      console.error("Error en GitHub Vault Storage:", err);
      throw err;
    }
  }

  // Obtener archivos de un proyecto guardado en GitHub
  async fetchProjectFiles(owner, repo, projectName) {
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (this.token) headers['Authorization'] = `token ${this.token}`;

    const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${projectName}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`No se pudo leer el proyecto '${projectName}' desde GitHub`);

    const items = await res.json();
    const resultFiles = {};

    for (const item of items) {
      if (item.type === 'file') {
        const fileRes = await fetch(item.download_url);
        if (fileRes.ok) {
          resultFiles[item.name] = await fileRes.text();
        }
      }
    }
    return resultFiles;
  }
}

window.GitHubVaultStorage = GitHubVaultStorage;
