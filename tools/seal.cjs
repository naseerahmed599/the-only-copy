#!/usr/bin/env node
/* Seal the story and her photograph with the gate phrase.
   Usage:  node tools/seal.cjs "the phrase"
   Reads  scenes.js (local only, not in the repo) and img/39-her-shelf.jpg (local only),
   writes sealed/story.json and sealed/shelf.json: AES-256-GCM, key from PBKDF2-SHA256 over the
   normalised phrase (lower case, no accents, no spaces), 250 000 iterations, one random salt.
   The phrase itself is written nowhere. */
const fs = require("fs");
const path = require("path");
const { webcrypto } = require("crypto");
const subtle = webcrypto.subtle; const getRandomValues = a => webcrypto.getRandomValues(a);

const phrase = process.argv[2] || process.env.SEAL_PHRASE;
if (!phrase) { console.error("usage: node tools/seal.cjs \"the phrase\""); process.exit(1); }
const norm = v => String(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const root = path.join(__dirname, "..");
const b64 = u8 => Buffer.from(u8).toString("base64");

(async () => {
  global.window = {};
  require(path.join(root, "scenes.js"));
  const story = Buffer.from(JSON.stringify(window.SCENES), "utf8");
  const photoPath = path.join(root, "img", "39-her-shelf.jpg");
  const photo = fs.existsSync(photoPath) ? fs.readFileSync(photoPath) : null;

  // keep the salt from a previous seal so a device that remembered the key keeps opening the edition
  const prev = path.join(root, "sealed", "story.json");
  const salt = fs.existsSync(prev) ? new Uint8Array(Buffer.from(JSON.parse(fs.readFileSync(prev, "utf8")).salt, "base64")) : getRandomValues(new Uint8Array(16));
  const km = await subtle.importKey("raw", Buffer.from(norm(phrase), "utf8"), "PBKDF2", false, ["deriveKey"]);
  const key = await subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, km, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  async function seal(bytes, kind) {
    const iv = getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
    return { v: 1, kind, salt: b64(salt), iv: b64(iv), data: b64(data) };
  }
  fs.mkdirSync(path.join(root, "sealed"), { recursive: true });
  fs.writeFileSync(path.join(root, "sealed", "story.json"), JSON.stringify(await seal(story, "story")));
  console.log("sealed/story.json", story.length, "bytes of story");
  if (photo) { fs.writeFileSync(path.join(root, "sealed", "shelf.json"), JSON.stringify(await seal(photo, "image/jpeg"))); console.log("sealed/shelf.json", photo.length, "bytes of photo"); }
  else console.log("no img/39-her-shelf.jpg found; shelf not sealed");
})().catch(e => { console.error(e); process.exit(1); });
