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
    this.currentUser = null;
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
      const result = await this.auth.signInWithPopup(this.googleProvider);
      return result.user;
    } catch (error) {
      console.error("Error en Google Auth:", error);
      throw error;
    }
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
        userDisplayName: this.currentUser.displayName,
        userPhoto: this.currentUser.photoURL,
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
