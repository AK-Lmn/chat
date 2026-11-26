import { describe, expect, test } from 'bun:test';
import { parseStudioCommand, SOCIAL_SIZES } from '../web/src/studio-commands.js';
import catalog from '../plugins/catalog.json';

const STUDIO_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2'];

describe('Social image sizes plugin (studio.social-sizes)', () => {
  test('catalog marks studio.social-sizes as ready with its voice phrase', () => {
    const p = catalog.plugins.find((x) => x.id === 'studio.social-sizes');
    expect(p).toBeDefined();
    expect(p.title).toBe('Social image sizes');
    expect(p.group).toBe('Studio next');
    expect(p.status).toBe('ready');
    expect(p.owner).toBe('flisk');
    expect(p.voice).toContain('make it an instagram story');
  });

  test('all social size presets map to supported Studio aspect ratios and valid dimensions', () => {
    expect(SOCIAL_SIZES.length).toBeGreaterThanOrEqual(10);
    for (const s of SOCIAL_SIZES) {
      expect(STUDIO_RATIOS).toContain(s.ratio);
      expect(s.width).toBeGreaterThan(0);
      expect(s.height).toBeGreaterThan(0);
    }
  });

  test.each([
    ['make it an instagram story', { cmd: 'crop', ratio: '9:16', preset: 'instagram-story', width: 1080, height: 1920 }],
    ['Make it an Instagram Story!', { cmd: 'crop', ratio: '9:16', preset: 'instagram-story', width: 1080, height: 1920 }],
    ['crop for ig story', { cmd: 'crop', ratio: '9:16', preset: 'instagram-story', width: 1080, height: 1920 }],
    ['resize for tiktok', { cmd: 'crop', ratio: '9:16', preset: 'tiktok', width: 1080, height: 1920 }],
    ['make it a youtube short', { cmd: 'crop', ratio: '9:16', preset: 'youtube-short', width: 1080, height: 1920 }],
    ['instagram post size', { cmd: 'crop', ratio: '1:1', preset: 'instagram-post', width: 1080, height: 1080 }],
    ['make it a profile picture', { cmd: 'crop', ratio: '1:1', preset: 'profile-picture', width: 1080, height: 1080 }],
    ['instagram portrait', { cmd: 'crop', ratio: '3:4', preset: 'instagram-portrait', width: 1080, height: 1440 }],
    ['youtube thumbnail', { cmd: 'crop', ratio: '16:9', preset: 'youtube-thumbnail', width: 1280, height: 720 }],
    ['linkedin banner', { cmd: 'crop', ratio: '16:9', preset: 'linkedin-banner', width: 1584, height: 891 }],
    ['facebook cover', { cmd: 'crop', ratio: '16:9', preset: 'facebook-cover', width: 1640, height: 924 }],
    ['social image sizes', { cmd: 'crop', ratio: null }],
  ])('parses "%s"', (input, expected) => {
    expect(parseStudioCommand(input)).toEqual(expected);
  });

  test.each([
    'what is an instagram story',
    'how do I post an instagram story',
    'write an instagram story caption',
    'instagram story ideas for my bakery',
    'build a tiktok clone app',
    'make it an instagram story with lots of extra details that makes this prompt exceed eighty characters easily',
  ])('leaves non-editing request "%s" to the chat', (input) => {
    expect(parseStudioCommand(input)).toBeNull();
  });

  test('picker opens Studio for ready studio.* plugins and App wires typed and spoken commands', async () => {
    const pluginsSrc = await Bun.file(new URL('../web/src/Plugins.jsx', import.meta.url)).text();
    expect(pluginsSrc).toContain("p.status === 'ready' && p.id.startsWith('studio.')");
    const appSrc = await Bun.file(new URL('../web/src/App.jsx', import.meta.url)).text();
    const readyCount = catalog.plugins.filter((p) => p.status === 'ready').length;
    expect(appSrc).toContain(`${catalog.plugins.length} plugins, ${readyCount} ready`);
    expect(appSrc).toContain('const toStudio = (text) => { const c = studio && parseStudioCommand(text); return !!c && sendToStudio(studioFrame.current, c); };');
    expect(appSrc).toContain('if (text && toStudio(text))');
    expect(appSrc).toContain('if (!files.length && toStudio(task))');
  });
});
