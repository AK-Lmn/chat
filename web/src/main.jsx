import './app.css';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import {useState, useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme} from '@astryxdesign/core/theme';
import {themes, defaultThemeSlug} from '../astryx-themes.js';
import App from './App.jsx';
function Root() {
  const [scheme, setScheme] = useState(() => { try { return localStorage.getItem('chat_scheme') || 'system'; } catch (e) { return 'system'; } });
  const set = (v) => { setScheme(v); try { localStorage.setItem('chat_scheme', v); } catch (e) { /* storage blocked */ } document.documentElement.dataset.scheme = v; };
  useEffect(() => { document.documentElement.dataset.scheme = scheme; }, []);
  return <Theme theme={themes[defaultThemeSlug]} mode={scheme}><App scheme={scheme} setScheme={set} /></Theme>;
}
createRoot(document.getElementById('root')).render(<Root />);
