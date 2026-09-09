import React, { useEffect, useMemo, useState } from 'react';
import ReviewAuth from './ReviewAuth.jsx';
import ReviewLanding from './ReviewLanding.jsx';
import ReviewPrivacy from './ReviewPrivacy.jsx';
import ReviewSender from './ReviewSender.jsx';
import ReviewSignup from './ReviewSignup.jsx';
import {
  fetchReviewMe,
  logoutReviewUser,
  readSession,
  saveReviewBusinesses
} from '../lib/reviewAuth.js';
import { decodeShareToken, loadBusinesses, upsertBusiness } from '../lib/reviewDispatch.js';

function readRoute() {
  const raw = (window.location.hash || '#/').replace(/^#/, '');
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  if (path.startsWith('/privacy')) return { name: 'privacy' };
  if (path.startsWith('/login')) return { name: 'auth', mode: 'login' };
  if (path.startsWith('/auth') || path.startsWith('/register')) return { name: 'auth', mode: 'register' };
  if (path.startsWith('/signup')) return { name: 'signup' };
  if (path.startsWith('/b/')) return { name: 'send', token: path.slice(3) };
  return { name: 'home' };
}

function go(path) {
  window.location.hash = path;
}

export default function ReviewsApp() {
  const [route, setRoute] = useState(readRoute);
  const [session, setSession] = useState(() => readSession());
  const [selectedId, setSelectedId] = useState(() => readSession()?.user?.businesses?.[0]?.id || '');

  const shared = useMemo(
    () => (route.token ? decodeShareToken(route.token) : null),
    [route.token]
  );

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const token = readSession()?.token;
      if (!token) return;
      try {
        const next = await Promise.race([
          fetchReviewMe(token),
          new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error('TIMEOUT')), 8000);
          })
        ]);
        if (!cancelled) {
          setSession(next);
          setSelectedId(next?.user?.businesses?.[0]?.id || '');
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.message === 'TIMEOUT') return;
        setSession(readSession());
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const businesses = Array.isArray(session?.user?.businesses) ? session.user.businesses : [];

  async function persistBusiness(business) {
    const saved = upsertBusiness(business);
    const nextList = loadBusinesses();
    if (session?.token) {
      const next = await saveReviewBusinesses(session.token, nextList);
      setSession(next);
      setSelectedId(saved?.id || next?.user?.businesses?.[0]?.id || '');
    } else {
      setSelectedId(saved?.id);
    }
    return saved;
  }

  if (route.name === 'privacy') {
    return <ReviewPrivacy />;
  }

  if (!session?.token) {
    if (route.name === 'auth') {
      return (
        <ReviewAuth
          initialMode={route.mode}
          onAuth={(next) => {
            setSession(next);
            go('/send');
          }}
        />
      );
    }
    return (
      <ReviewLanding
        signedIn={false}
        onStart={() => go('/auth')}
        onLogin={() => go('/login')}
      />
    );
  }

  const showSignup = route.name === 'signup' || (route.name === 'send' && businesses.length === 0 && !shared);

  if (showSignup && !shared) {
    return (
      <ReviewSignup
        business={businesses[0] || null}
        onSaved={async (nextBusiness) => {
          await persistBusiness(nextBusiness);
          go('/send');
        }}
        onOpenSend={() => go('/send')}
      />
    );
  }

  const list = businesses.length ? businesses : (shared ? [shared] : []);

  return (
    <ReviewSender
      key={list[0]?.id || 'send'}
      businesses={list}
      onAddBusiness={() => go('/signup')}
      onLogout={async () => {
        await logoutReviewUser(session.token);
        setSession(null);
        go('/');
      }}
    />
  );
}
