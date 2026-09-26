import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const webSrc = resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/web/src');
const page = () => readFileSync(resolve(webSrc, 'app/(workspace)/settings/ai-providers/page.tsx'), 'utf-8');

// Spec 4 acceptance: the settings page below is only meaningful as a set of
// promises the user can keep. These assertions cover the affordances that were
// missing before 8.4, not the styling.
describe('AI Providers connect wizard (spec 4)', () => {
  it('renders inside the shared settings shell, with a raw error for correlation IDs', () => {
    const src = page();
    expect(src).toMatch(/<SettingsPage/);
    expect(src).toMatch(/loading=\{loading\}/);
    expect(src).toMatch(/error=\{error\}/);
    expect(src).toMatch(/unauthorized=\{unauthorized\}/);
    expect(src).toMatch(/const \[error, setError\] = useState<unknown>\(null\);/);
    expect(src).not.toMatch(/setError\(errMsg\(/);
  });

  it('walks choose provider → key → test connection → choose models', () => {
    const src = page();
    expect(src).toMatch(
      /'Choose provider', 'Enter key', 'Test connection', 'Choose models'/,
    );
    expect(src).toMatch(/aria-current=\{step === i \+ 1 \? 'step' : undefined\}/);
    expect(src).toMatch(/setStep\(provider \? 2 : 1\)/);
    expect(src).toMatch(/Save and test connection/);
  });

  it('never renders the key back: password input, cleared after save, suffix only', () => {
    const src = page();
    expect(src).toMatch(/type="password"/);
    // Cleared immediately after the save call, before the test round trip.
    expect(src).toMatch(/setApiKey\(''\);/);
    expect(src).toMatch(/keySuffix/);
    // The key is interpolated in exactly one place: the password input's value.
    // Any second interpolation would be a leak into rendered text.
    expect(src.match(/\{apiKey\}/g) ?? []).toHaveLength(1);
    expect(src).toMatch(/value=\{apiKey\}/);
  });

  it('labels the chat capability with its lead-research duty (D3)', () => {
    expect(page()).toMatch(/chat_rag: 'Chat, RAG & lead research'/);
  });

  it('shows which provider and model each task uses, and the safe failure mode', () => {
    const src = page();
    expect(src).toMatch(/Selected for: \{capsFor\(cat\.id\)\.join\(', '\)\}/);
    expect(src).toMatch(/no provider\s+configured/);
    expect(src).toMatch(/provider is not enabled/);
  });

  it('keeps the existing required states: no provider, no model, test outcome', () => {
    const src = page();
    expect(src).toMatch(/Connect a provider/); // no provider configured
    expect(src).toMatch(/No compatible model/); // no compatible model
    expect(src).toMatch(/No compatible \{capLabel\(defaultCap\)\} model/);
    expect(src).toMatch(/Saved, but the connection test failed/); // test failed
    expect(src).toMatch(/Not tested yet/); // last successful test
  });
});
