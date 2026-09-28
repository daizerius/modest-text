// Constants, shared application state, translation function, tab helpers.
import { makeT } from './i18n.js';

// ---------------------------------------------------------------- constants
export const SIZES = [['size_xs', 10], ['size_s', 13], ['size_m', 16], ['size_l', 18], ['size_xl', 24], ['size_xxl', 32]];
export const LOCK_NAME = 'modest-text:v1:editor';
export const LEASE_RENEW = 2000;
export const LEASE_TTL = 10000;
export const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
// Key names shown in tooltips and Help: the platform's own (⌘ / ⌥ on a Mac, as its menus write them; Ctrl / Alt elsewhere).
export const KEYS = isMac ? { mod: '⌘', alt: '⌥', mac: true } : { mod: 'Ctrl', alt: 'Alt', mac: false };

export const $ = (id) => document.getElementById(id);
export const html = document.documentElement;
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const windowId = newId();
export const ric = window.requestIdleCallback ? (f) => window.requestIdleCallback(f, { timeout: 1000 }) : (f) => setTimeout(f, 1);
export const cic = window.cancelIdleCallback ? (h) => window.cancelIdleCallback(h) : (h) => clearTimeout(h);

// ---------------------------------------------------------------- state
// mdFont: font of Markdown text; monoFont: monospace font of plain-text tabs and code;
// read: the text is laid out as a centred column of readable width.
export const settings = { theme: null, lang: null, mdFont: null, monoFont: null, size: 16, wrap: true, read: false };

// Shared, mutable application state (one object, so that every module sees the same values).
export const S = {
  lang: 'en',
  tabs: [],
  activeId: null,
  brokenIds: [],
  closedStack: [],
  role: 'pending',
  indexReadFailed: false,
  indexDirty: false,
  indexFailed: false,
  full: false,
  probeFailed: false,
  amberNotified: false,
  lastProbe: 0,
  saveTimer: null,
  idleHandle: null,
  savePending: false,
  installed: {},
  view: null,
  lastRealActive: null,
  firstLaunch: false,
  localEdit: false, // something was changed in this window since it became the editor
};

// The translation function of the current language; setT() switches it (see applyLang).
let tr = makeT('en', KEYS);
export const t = (key, vars) => tr(key, vars);
t.key = (name) => tr.key(name); // shortcut label in the platform's key names
t.num = (n) => tr.num(n); // a number in the interface language (1,302 / 1 302)
Object.defineProperty(t, 'lang', { get: () => tr.lang }); // 'en' | 'fr', for Intl formatting
export function setT(fn) { tr = fn; }

export const activeTab = () => S.tabs.find((x) => x.id === S.activeId) || null;
export const textOf = (tab) => tab.state.doc.toString();
export const names = (except) => S.tabs.filter((x) => x !== except && !x.help).map((x) => x.name);
