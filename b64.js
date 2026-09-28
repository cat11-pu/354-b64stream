// b64.js：三字节一组的 Base64 对照（无补齐字符）与去头三字节后的残留
const TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function groupOf(buffer) {
  const text = String(buffer == null ? "" : buffer);
  if (text.length < 3) return "";
  const value = (text.charCodeAt(0) << 16) | (text.charCodeAt(1) << 8) | text.charCodeAt(2);
  return TABLE[(value >>> 18) & 63] + TABLE[(value >>> 12) & 63]
    + TABLE[(value >>> 6) & 63] + TABLE[value & 63];
}

export function leftOf(buffer) {
  const text = String(buffer == null ? "" : buffer);
  return text.length < 3 ? text : text.slice(3);
}
