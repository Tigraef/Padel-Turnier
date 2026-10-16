// Nur für die iPad-Version: Ergänzungen für alte Safari-Versionen (ab iOS 9).
// Muss vor allen anderen Modulen geladen werden.
import { fetch as fetchPolyfill, Headers, Request, Response } from 'whatwg-fetch';

// Immer die XHR-basierte Variante nutzen: sie hängt bei cache: 'no-store' einen Zeitstempel an
// und verhindert so, dass alte Safari-Versionen veraltete Turnierstände aus dem Cache liefern.
window.fetch = fetchPolyfill;
window.Headers = window.Headers || Headers;
window.Request = window.Request || Request;
window.Response = window.Response || Response;

if (typeof window.TextEncoder === 'undefined') {
  window.TextEncoder = function TextEncoder() {};
  window.TextEncoder.prototype.encode = function encode(text) {
    const bin = unescape(encodeURIComponent(String(text)));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
}

if (typeof window.TextDecoder === 'undefined') {
  window.TextDecoder = function TextDecoder() {};
  window.TextDecoder.prototype.decode = function decode(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(bin));
  };
}
