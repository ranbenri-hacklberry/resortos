import React, { useState } from 'react';
import {
  Clock,
  Footprints,
  MapPin,
  ShoppingBag,
  Sparkles,
  Utensils
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  ATTRACTIONS,
  RESTAURANTS,
  SHOPS,
  TRAILS,
  guideClusterForUnit,
  placeDistance,
  placePhoto,
  placesForCluster
} from '../lib/areaGuide';
import { useDynamicText } from '../lib/translator';
import GuestPlaceLinks from './GuestPlaceLinks';
import '../guest.css';

function LiveText({ text }) {
  const translated = useDynamicText(text, null, 'he');
  return <>{translated}</>;
}

function PlaceCard({ place, themeStyles, labels, cluster }) {
  const photo = placePhoto(place);
  const dist = placeDistance(place, cluster);

  return (
    <article
      className="guest-guide-card"
      style={{
        background: themeStyles.inputBg,
        border: `1px solid ${themeStyles.inputBorder}`,
        borderRadius: 14,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box'
      }}
    >
      <div
        className="guest-guide-hero guest-guide-hero--photo"
        style={{
          position: 'relative',
          height: 120,
          width: '100%',
          overflow: 'hidden',
          background: '#1e293b'
        }}
      >
        <img
          src={photo}
          alt=""
          className="guest-guide-photo"
          loading="lazy"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block'
          }}
        />
        {place.price ? (
          <span
            className="guest-guide-badge"
            style={{
              position: 'absolute',
              top: 8,
              insetInlineEnd: 8,
              zIndex: 2,
              background: 'rgba(15, 23, 42, 0.72)',
              backdropFilter: 'blur(6px)',
              color: '#F8FAFC',
              fontSize: '0.64rem',
              fontWeight: 800,
              borderRadius: 999,
              padding: '0.22rem 0.55rem'
            }}
          >
            <LiveText text={place.price} />
          </span>
        ) : null}
      </div>

      <div
        className="guest-guide-body"
        style={{
          padding: '0.75rem 0.85rem 0.9rem',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          gap: 4
        }}
      >
        <div
          className="guest-guide-title"
          style={{
            fontWeight: 900,
            fontSize: '0.92rem',
            lineHeight: 1.3,
            color: themeStyles.textPrimary
          }}
        >
          <LiveText text={place.title} />
        </div>
        <div style={{ fontSize: '0.72rem', color: themeStyles.textMuted }}>
          <LiveText text={place.kind} />
        </div>

        {dist ? (
          <div
            className="guest-guide-meta"
            style={{
              color: themeStyles.textMuted,
              fontSize: '0.74rem',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 2
            }}
          >
            <MapPin size={12} color={themeStyles.accent} />
            <LiveText text={dist} />
          </div>
        ) : null}

        <div
          className="guest-guide-hours"
          style={{
            marginTop: 4,
            fontSize: '0.72rem',
            fontWeight: 800,
            lineHeight: 1.35,
            color: themeStyles.textPrimary,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 5
          }}
        >
          <Clock size={12} color={themeStyles.accent} style={{ marginTop: 2, flexShrink: 0 }} />
          <span><LiveText text={place.hours || labels.hoursUnknown} /></span>
        </div>

        {place.desc ? (
          <p
            className="guest-guide-desc"
            style={{
              margin: '4px 0 8px',
              color: themeStyles.textMuted,
              fontSize: '0.76rem',
              lineHeight: 1.45,
              flex: 1
            }}
          >
            <LiveText text={place.desc} />
          </p>
        ) : null}

        <div style={{ marginTop: 'auto', paddingTop: 4 }}>
          <GuestPlaceLinks
            compact
            wazeUrl={place.wazeUrl}
            mapsUrl={place.mapsUrl}
            phone={place.phone}
            showPhone={Boolean(place.phone)}
            wazeLabel={labels.waze}
            mapsLabel={labels.maps}
            callLabel={labels.call}
          />
        </div>
      </div>
    </article>
  );
}

export default function GuestAreaGuide({ themeStyles, initialTab = 'trails', unitId }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState(initialTab);
  const cluster = guideClusterForUnit(unitId);

  const tabs = [
    { id: 'trails', label: t('GUEST_TAB_TRAILS'), Icon: Footprints, places: TRAILS },
    { id: 'food', label: t('GUEST_TAB_FOOD'), Icon: Utensils, places: RESTAURANTS },
    { id: 'shops', label: t('GUEST_TAB_SHOPS'), Icon: ShoppingBag, places: SHOPS },
    { id: 'attractions', label: t('GUEST_TAB_ATTRACTIONS'), Icon: Sparkles, places: ATTRACTIONS }
  ];

  const active = tabs.find((item) => item.id === tab) || tabs[0];
  const labels = {
    waze: t('GUEST_WAZE'),
    maps: t('GUEST_MAPS'),
    call: t('GUEST_CALL_HOST'),
    hours: t('GUEST_OPEN_HOURS'),
    hoursUnknown: t('GUEST_OPEN_HOURS_UNKNOWN')
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 6,
          background: themeStyles.inputBg,
          padding: 4,
          borderRadius: 12,
          border: `1px solid ${themeStyles.inputBorder}`
        }}
      >
        {tabs.map(({ id, label, Icon }) => {
          const on = active.id === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              style={{
                border: 'none',
                cursor: 'pointer',
                borderRadius: 10,
                padding: '0.6rem 0.35rem',
                fontWeight: 800,
                fontSize: '0.74rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                background: on ? themeStyles.accent : 'transparent',
                color: on ? themeStyles.ctaText : themeStyles.textMuted,
                transition: 'all 0.15s ease'
              }}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      <div
        className="guest-guide-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
          gap: 12
        }}
      >
        {placesForCluster(active.places, cluster).map((place) => (
          <PlaceCard key={place.id} place={place} themeStyles={themeStyles} labels={labels} cluster={cluster} />
        ))}
      </div>
    </div>
  );
}
