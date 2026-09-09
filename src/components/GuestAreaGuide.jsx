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
      style={{ background: themeStyles.inputBg, border: `1px solid ${themeStyles.inputBorder}` }}
    >
      <div className="guest-guide-hero guest-guide-hero--photo">
        <img src={photo} alt="" className="guest-guide-photo" loading="lazy" />
        {place.price ? (
          <span className="guest-guide-badge">
            <LiveText text={place.price} />
          </span>
        ) : null}
      </div>

      <div className="guest-guide-body">
        <div className="guest-guide-title">
          <LiveText text={place.title} />
        </div>
        <div style={{ fontSize: '0.66rem', color: themeStyles.textMuted, marginTop: 2 }}>
          <LiveText text={place.kind} />
        </div>

        <div className="guest-guide-meta" style={{ color: themeStyles.textMuted }}>
          {dist ? (
            <span><MapPin size={11} /> <LiveText text={dist} /></span>
          ) : null}
        </div>

        <div
          className="guest-guide-hours"
          style={{
            marginTop: 6,
            fontSize: '0.66rem',
            fontWeight: 800,
            lineHeight: 1.35,
            color: themeStyles.textPrimary
          }}
        >
          <Clock size={11} color={themeStyles.accent} style={{ verticalAlign: '-1px', marginInlineEnd: 4 }} />
          <LiveText text={place.hours || labels.hoursUnknown} />
        </div>

        {place.desc ? (
          <p className="guest-guide-desc" style={{ color: themeStyles.textMuted }}>
            <LiveText text={place.desc} />
          </p>
        ) : null}

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
                padding: '0.55rem 0.3rem',
                fontWeight: 800,
                fontSize: '0.72rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                background: on ? themeStyles.accent : 'transparent',
                color: on ? themeStyles.ctaText : themeStyles.textMuted
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>

      <div className="guest-guide-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {placesForCluster(active.places, cluster).map((place) => (
          <PlaceCard key={place.id} place={place} themeStyles={themeStyles} labels={labels} cluster={cluster} />
        ))}
      </div>
    </div>
  );
}
