#!/usr/bin/env node
/* TAIMER licence tooling — no services, no accounts, no network.
 *
 *   node tools/keygen.mjs init
 *       Makes a signing pair. The private key is written to
 *       tools/private-key.jwk (never commit it) and the public half is
 *       written into app.js, where the app checks keys against it.
 *
 *   node tools/keygen.mjs issue --plan pro --name "Albin Mashabe" --expires 2027-12-31
 *       Prints a licence key to hand to whoever paid you.
 *       Add --copy <id> to tie the key to one installation.
 */

import { webcrypto as crypto } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PRIVATE = join(here, 'private-key.jwk');
const APP = join(here, '..', 'app.js');
const ALGO = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };

const b64url = buf => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function init() {
  if (existsSync(PRIVATE)) {
    console.error('tools/private-key.jwk already exists. Move it aside first if you really mean to replace it —\n' +
                  'every key you have already issued stops working when the pair changes.');
    process.exit(1);
  }
  const pair = await crypto.subtle.generateKey(ALGO, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);

  writeFileSync(PRIVATE, JSON.stringify(priv, null, 2) + '\n', { mode: 0o600 });

  const line = `  var LICENCE_KEY_PUBLIC = ${JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y })};`;
  const app = readFileSync(APP, 'utf8');
  if (!/^ {2}var LICENCE_KEY_PUBLIC = .*;$/m.test(app)) {
    console.error('Could not find the LICENCE_KEY_PUBLIC line in app.js.');
    process.exit(1);
  }
  writeFileSync(APP, app.replace(/^ {2}var LICENCE_KEY_PUBLIC = .*;$/m, line));

  console.log('Signing pair made.');
  console.log('  private  tools/private-key.jwk   keep this safe, off the repository, backed up');
  console.log('  public   written into app.js     commit that change and deploy');
}

async function issue(args) {
  if (!existsSync(PRIVATE)) {
    console.error('No tools/private-key.jwk here. Run "node tools/keygen.mjs init" first.');
    process.exit(1);
  }
  const opt = {};
  for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];

  const payload = {
    p: opt.plan || 'pro',
    n: opt.name || '',
    e: opt.expires || '',          // yyyy-mm-dd, empty for no end date
    c: opt.copy || '',             // bind to one installation, optional
    k: Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
  };

  const priv = await crypto.subtle.importKey('jwk', JSON.parse(readFileSync(PRIVATE, 'utf8')), ALGO, false, ['sign']);
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const sig = await crypto.subtle.sign(SIGN, priv, body);

  console.log('TAIMER1.' + b64url(body) + '.' + b64url(sig));
  console.error('\nplan %s%s%s', payload.p,
    payload.n ? ' · ' + payload.n : '',
    payload.e ? ' · until ' + payload.e : ' · no end date');
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'init') await init();
else if (cmd === 'issue') await issue(rest);
else {
  console.log('usage:\n  node tools/keygen.mjs init\n' +
              '  node tools/keygen.mjs issue --plan pro --name "Someone" --expires 2027-12-31 [--copy <id>]');
}
