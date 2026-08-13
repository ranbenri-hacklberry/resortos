import React, { useState, useEffect } from 'react';
import { Sparkles, Trash2, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export default function Studio({ session, context, setActiveTab }) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [history, setHistory] = useState([]);
  const [isDirect, setIsDirect] = useState(false);

  useEffect(() => {
    fetch('/api/history').then(r => r.json()).then(data => setHistory(data || [])).catch(() => {});
  }, []);

  const generate = async () => {
    if (!prompt || isGenerating) return;
    setIsGenerating(true);
    try {
      const res = await fetch('/api/generateImage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, num_inference_steps: isDirect ? 4 : 20 })
      });
      const data = await res.json();
      if (data.image_url) setHistory(prev => [data.image_url, ...prev]);
    } catch (e) {} finally { setIsGenerating(false); }
  };

  return (
    <div style={{ maxWidth: '1200px', marginInline: 'auto', padding: '2.5rem 1.5rem' }}>

      {/* Studio Console */}
      <div className="studio-console">
        <textarea
          placeholder={t('VISION_DESC')}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
        />

        <div className="studio-footer">
          <div className="toggle-group">
            <span className={`toggle-label ${isDirect ? 'on' : ''}`}>{t('DIRECT_MODE')}</span>
            <button
              className={`toggle-track ${isDirect ? 'on' : ''}`}
              onClick={() => setIsDirect(!isDirect)}
            >
              <div className="toggle-thumb" />
            </button>
          </div>

          <button className="btn-primary" onClick={generate} disabled={isGenerating}>
            <Sparkles size={18} />
            <span>{isGenerating ? t('PROCESSING') : t('EXECUTE')}</span>
          </button>
        </div>
      </div>

      {/* Asset Grid */}
      <div className="asset-grid" style={{ marginBlockStart: '3rem' }}>
        <AnimatePresence>
          {history.map((url) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              key={url}
              className="asset-cell"
            >
              <img src={url} alt="" />
              <div className="asset-overlay">
                <a href={url} download className="overlay-btn"><Download size={16} /></a>
                <button className="overlay-btn"><Trash2 size={16} /></button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
