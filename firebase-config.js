// Arkaios-World Firebase SDK Configuration & Authentication Service
const firebaseConfig = {
  apiKey: "AIzaSyD-ceCiJPVnLlepVBcMBhLABJEC771uypM",
  authDomain: "arkaios-world.firebaseapp.com",
  projectId: "arkaios-world",
  storageBucket: "arkaios-world.firebasestorage.app",
  messagingSenderId: "502663599735",
  appId: "1:502663599735:web:d702f5242ff9672e9c9872",
  measurementId: "G-7DM0S4M5QJ"
};

// Initialize Firebase if not already initialized
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

class ArkaiosAuthService {
  constructor() {
    this.auth = typeof firebase !== 'undefined' ? firebase.auth() : null;
    this.db = typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null;
    this.googleProvider = typeof firebase !== 'undefined' ? new firebase.auth.GoogleAuthProvider() : null;
    this.currentUser = undefined;
    this.listeners = [];

    if (this.auth) {
      this.auth.onAuthStateChanged((user) => {
        this.currentUser = user;
        this.listeners.forEach(cb => cb(user));
      });
    }
  }

  onAuthChange(callback) {
    if (typeof callback === 'function') {
      this.listeners.push(callback);
      if (this.currentUser !== undefined) {
        callback(this.currentUser);
      }
    }
  }

  async signInWithGoogle() {
    if (!this.auth || !this.googleProvider) {
      throw new Error("Firebase Auth SDK no cargado.");
    }
    try {
      // En Electron, signInWithPopup falla porque las ventanas popup están
      // bloqueadas. Usamos signInWithRedirect que funciona correctamente
      // cuando la app está servida desde http://127.0.0.1 (nuestro servidor embebido).
      await this.auth.signInWithRedirect(this.googleProvider);
    } catch (error) {
      // Fallback: intentar popup si redirect no está disponible
      try {
        const result = await this.auth.signInWithPopup(this.googleProvider);
        return result.user;
      } catch (popupError) {
        console.error("Error en Google Auth (popup fallback):", popupError);
        throw popupError;
      }
    }
  }

  async checkRedirectResult() {
    if (!this.auth) return null;
    try {
      const result = await this.auth.getRedirectResult();
      if (result && result.user) {
        return result.user;
      }
    } catch (e) {
      console.warn("getRedirectResult:", e.message);
    }
    return null;
  }


  async signInWithEmail(email, password) {
    if (!this.auth) throw new Error("Firebase Auth SDK no cargado.");
    const result = await this.auth.signInWithEmailAndPassword(email, password);
    return result.user;
  }

  async registerWithEmail(email, password) {
    if (!this.auth) throw new Error("Firebase Auth SDK no cargado.");
    const result = await this.auth.createUserWithEmailAndPassword(email, password);
    return result.user;
  }

  async resetPassword(email) {
    if (!this.auth) throw new Error("Firebase Auth SDK no cargado.");
    await this.auth.sendPasswordResetEmail(email);
  }

  async signOut() {
    if (this.auth) {
      await this.auth.signOut();
    }
  }

  // Save deployment metadata to Firestore under user profile
  async recordDeployment(subdomain, targetFolder, authorName, projectName) {
    if (!this.db || !this.currentUser) return;
    try {
      const deployRef = this.db.collection('deployments').doc(subdomain);
      await deployRef.set({
        subdomain: subdomain,
        url: `https://${subdomain}.puter.site/`,
        author: authorName,
        project: projectName,
        targetFolder: targetFolder,
        userId: this.currentUser.uid,
        userEmail: this.currentUser.email,
        userDisplayName: this.currentUser.displayName || this.currentUser.email.split('@')[0],
        userPhoto: this.currentUser.photoURL || '',
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch(e) {
      console.warn("Fallo guardando historial en Firestore:", e);
    }
  }

  async getUserDeployments() {
    if (!this.db || !this.currentUser) return [];
    try {
      const snapshot = await this.db.collection('deployments')
        .where('userId', '==', this.currentUser.uid)
        .orderBy('timestamp', 'desc')
        .get();
      return snapshot.docs.map(doc => doc.data());
    } catch(e) {
      console.warn("Fallo obteniendo historial de Firestore:", e);
      return [];
    }
  }
}

window.ArkaiosAuth = new ArkaiosAuthService();
