import React, { useState, useEffect } from 'react';
import { Grid, Upload, FileText, Download, Trash2, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Media({ session, context, selectionMode = false, onSelect = () => {} }) {
    const { t } = useTranslation();
    const [view, setView] = useState('generations');
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        setAssets([]);
        fetch(`/api/assets?type=${view}`)
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(data => setAssets(Array.isArray(data) ? data : []))
            .catch(() => setAssets([]))
            .finally(() => setLoading(false));
    }, [view]);

    const subTabs = [
        { id: 'generations', label: t('GEN_HISTORY'), icon: <Grid size={14} /> },
        { id: 'uploads', label: t('UPLOADS'), icon: <Upload size={14} /> },
        { id: 'docs', label: t('CLIENT_DOCS'), icon: <FileText size={14} /> },
    ];

    return (
        <div style={{ maxWidth: '1200px', marginInline: 'auto', padding: '2.5rem 1.5rem' }}>
            <div className="sub-tabs">
                {subTabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setView(tab.id)}
                        className={`sub-tab ${view === tab.id ? 'active' : ''}`}
                    >
                        {tab.icon}
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem 0' }}>
                    <div className="spinner" />
                </div>
            ) : assets.length === 0 ? (
                <div className="empty-state">
                    <Grid size={48} />
                    <div style={{ marginBlockStart: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.85rem' }}>
                        No assets found
                    </div>
                </div>
            ) : (
                <div className="asset-grid">
                    {assets.map((item, idx) => (
                        <div 
                            key={idx} 
                            className="asset-cell"
                            onClick={() => selectionMode && onSelect(item.url)}
                            style={{ cursor: selectionMode ? 'copy' : 'pointer' }}
                        >
                            <img src={item.url} alt="" loading="lazy" />
                            <div className="asset-overlay">
                                {selectionMode ? (
                                    <div className="overlay-btn" style={{ background: 'var(--accent)', width: '3rem', height: '3rem' }}>
                                        <Check size={20} strokeWidth={3} />
                                    </div>
                                ) : (
                                    <>
                                        <a href={item.url} download className="overlay-btn"><Download size={16} /></a>
                                        <button className="overlay-btn" onClick={(e) => { e.stopPropagation(); /* delete logic */ }}><Trash2 size={16} /></button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
