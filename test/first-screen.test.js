import { test, expect } from 'bun:test';
import { appPage } from '../src/page.js';

// The GEL five-second rules (flisk-sh/gel guards/five-second-test), applied to the home page a visitor lands on.
const JARGON = /\b(?:pods?|orchestrat\w*|endpoints?|openai-compatible|inference|mcp|llms?|sdks?|serverless|runtimes?|kubernetes|k8s|namespaces?|tensors?|latency)\b/i;
const text = (h) => h.replace(/<script[\s\S]*?<\/script[^>]*>|<style[\s\S]*?<\/style[^>]*>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const words = (s) => (s.match(/\S+/g) || []).length;

test('the home first screen passes the five-second rules', () => {
  const html = appPage({ login: null, connected: [] });
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  expect(h1).not.toBeNull();
  const head = text(h1[1]);
  expect(words(head)).toBeLessThanOrEqual(12);
  expect(head).not.toMatch(JARGON);
  const after = html.slice(h1.index + h1[0].length);
  const p = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(after);
  expect(p).not.toBeNull();
  const lead = text(p[1]);
  expect(words(lead)).toBeGreaterThan(0);
  expect(words(lead)).toBeLessThanOrEqual(32);
  expect(lead).not.toMatch(JARGON);
  expect(/<(?:a|button)\b[^>]*>/i.test(after.slice(0, 2500))).toBe(true);
});
