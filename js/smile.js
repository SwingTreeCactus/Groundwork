/* RV app: minimal Smile (binary JSON) decoder, enough to read Ministry Assistant backups. */
(function (root) {
  'use strict';
  const RV = (root.RV = root.RV || {});

  function decode(bytes, opts) {
    const pairs = !!(opts && opts.pairs);
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length < 5 || b[0] !== 0x3a || b[1] !== 0x29 || b[2] !== 0x0a) throw new Error('Not a Smile file');
    const flags = b[3];
    const sharedKeys = (flags & 1) !== 0, sharedVals = (flags & 2) !== 0;
    let p = 4;
    const keyTable = [], valTable = [];
    const dec = new TextDecoder('utf-8');
    const str = (n) => { const s = dec.decode(b.subarray(p, p + n)); p += n; return s; };
    const strZ = () => { const st = p; while (b[p] !== 0xfc) p++; const s = dec.decode(b.subarray(st, p)); p++; return s; };
    const vint = () => {
      let v = 0n;
      for (;;) {
        const x = b[p++];
        if (x === undefined) throw new Error('Truncated');
        if (x & 0x80) { v = (v << 6n) | BigInt(x & 0x3f); return v; }
        v = (v << 7n) | BigInt(x);
      }
    };
    const zz = (v) => (v >> 1n) ^ -(v & 1n);
    const num = (v) => (v >= -9007199254740991n && v <= 9007199254740991n ? Number(v) : v.toString());
    const bits7 = (n) => { // n bytes of 7-bit groups -> BigInt
      let v = 0n;
      for (let i = 0; i < n; i++) v = (v << 7n) | BigInt(b[p++] & 0x7f);
      return v;
    };
    const addVal = (s) => { if (sharedVals && s.length <= 64) { if (valTable.length >= 1024) valTable.length = 0; valTable.push(s); } return s; };
    const addKey = (s) => { if (sharedKeys) { if (keyTable.length >= 1024) keyTable.length = 0; keyTable.push(s); } return s; };

    function readKey() {
      const t = b[p++];
      if (t === 0x20) return '';
      if (t >= 0x30 && t <= 0x33) return keyTable[((t & 3) << 8) | b[p++]];
      if (t === 0x34) return addKey(strZ());
      if (t >= 0x40 && t <= 0x7f) return keyTable[t - 0x40];
      if (t >= 0x80 && t <= 0xbf) return addKey(str((t & 0x3f) + 1));
      if (t >= 0xc0 && t <= 0xf7) return addKey(str((t & 0x3f) + 2));
      throw new Error('Bad key token 0x' + t.toString(16) + ' at ' + (p - 1));
    }
    function readValue() {
      const t = b[p++];
      if (t === undefined) throw new Error('Truncated');
      if (t === 0x00) return '';
      if (t >= 0x01 && t <= 0x1f) return valTable[t - 1];
      if (t >= 0xec && t <= 0xef) return valTable[((t & 3) << 8) | b[p++]];
      if (t === 0x20) return '';
      if (t === 0x21) return null;
      if (t === 0x22) return false;
      if (t === 0x23) return true;
      if (t === 0x24 || t === 0x25) return num(zz(vint()));
      if (t === 0x26) { const n = Number(vint() >> 0n) ; const raw = bits7Bytes(); return raw; }
      if (t === 0x28) { const v = bits7(5); const dv = new DataView(new ArrayBuffer(4)); dv.setUint32(0, Number(v & 0xffffffffn)); return dv.getFloat32(0); }
      if (t === 0x29) { const v = bits7(10); const dv = new DataView(new ArrayBuffer(8)); dv.setBigUint64(0, v & 0xffffffffffffffffn); return dv.getFloat64(0); }
      if (t >= 0x40 && t <= 0x5f) return addVal(str((t & 0x1f) + 1));
      if (t >= 0x60 && t <= 0x7f) return addVal(str((t & 0x1f) + 33));
      if (t >= 0x80 && t <= 0x9f) return addVal(str((t & 0x1f) + 2));
      if (t >= 0xa0 && t <= 0xbf) return addVal(str((t & 0x1f) + 34));
      if (t >= 0xc0 && t <= 0xdf) return num(zz(BigInt(t & 0x1f)));
      if (t === 0xe0 || t === 0xe4) return strZ();
      if (t === 0xf8) { const a = []; while (b[p] !== 0xf9) a.push(readValue()); p++; return a; }
      if (t === 0xfa) { const o = pairs ? [] : {}; while (b[p] !== 0xfb) { const k = readKey(); const v = readValue(); if (pairs) o.push([k, v]); else o[k] = v; } p++; return o; }
      throw new Error('Bad token 0x' + t.toString(16) + ' at ' + (p - 1));
    }
    function bits7Bytes() { throw new Error('Big numbers are not supported'); }
    return readValue();
  }

  async function gunzipIfNeeded(buf) {
    const u = new Uint8Array(buf);
    if (u[0] === 0x1f && u[1] === 0x8b) {
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed files');
      const ds = new DecompressionStream('gzip');
      const out = await new Response(new Blob([u]).stream().pipeThrough(ds)).arrayBuffer();
      return new Uint8Array(out);
    }
    return u;
  }

  RV.smile = { decode, gunzipIfNeeded };
  if (typeof module !== 'undefined' && module.exports) module.exports = RV.smile;
})(typeof window !== 'undefined' ? window : globalThis);
