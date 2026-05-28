/**
 * Timeless Cryptography Utils
 * Provides AES-256-GCM encryption/decryption for .tlf files
 */

export const CryptoUtils = {
  // Secreto maestro de la plataforma (en una app real esto vendría del servidor)
  PLATFORM_SALT: 'Timeless_Editorial_Premium_Ecosystem_2024',

  /**
   * Genera una llave de cifrado determinística basada en el ID del usuario y de la obra
   */
  async _deriveKey(userId, obraId) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.PLATFORM_SALT + userId + obraId),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode(obraId),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  /**
   * Encripta un objeto JSON
   */
  async encrypt(data, userId, obraId) {
    const key = await this._deriveKey(userId, obraId);
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(JSON.stringify(data))
    );

    // Retornamos IV + Datos encriptados en Base64
    const result = new Uint8Array(iv.byteLength + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), iv.byteLength);
    
    return btoa(String.fromCharCode(...result));
  },

  /**
   * Desencripta un string Base64
   */
  async decrypt(base64Data, userId, obraId) {
    const key = await this._deriveKey(userId, obraId);
    const decoder = new TextDecoder();
    const data = new Uint8Array(atob(base64Data).split('').map(c => c.charCodeAt(0)));
    
    const iv = data.slice(0, 12);
    const encrypted = data.slice(12);

    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
      );
      return JSON.parse(decoder.decode(decrypted));
    } catch (e) {
      throw new Error("No se pudo descifrar el archivo. Llave inválida o datos corruptos.");
    }
  }
};
