import React, { useState } from 'react';
import { FileText, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Documents({ session, context }) {
    const { t } = useTranslation();
    const [text, setText] = useState('');
    const [isBuilding, setIsBuilding] = useState(false);

    const buildPDF = async () => {
        if (!text.trim() || isBuilding) return;
        setIsBuilding(true);
        try {
            const res = await fetch('/api/pdf/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, context })
            });
            const data = await res.json();
            if (data.url) window.open(data.url, '_blank');
        } catch (e) {}
        setIsBuilding(false);
    };

    return (
        <div style={{ maxWidth: '960px', marginInline: 'auto', padding: '2.5rem 1.5rem' }}>
            <div className="studio-console">
                <textarea
                    style={{ minHeight: '350px', fontSize: '1.1rem', fontWeight: 500, fontStyle: 'normal' }}
                    placeholder={t('DOC_PLACEHOLDER')}
                    value={text}
                    onChange={e => setText(e.target.value)}
                />

                <div className="studio-footer">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <FileText size={18} style={{ color: 'var(--accent)', opacity: 0.6 }} />
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--accent)', opacity: 0.6 }}>
                            {t('PDF_READY')}
                        </span>
                    </div>

                    <button className="btn-primary" onClick={buildPDF} disabled={isBuilding}>
                        <Wand2 size={16} />
                        <span>{isBuilding ? t('PROCESSING') : t('BUILD_PDF')}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
