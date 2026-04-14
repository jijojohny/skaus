'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import Link from 'next/link';
import { getPublicLinkHost } from '@/lib/config';

const RED = '#FF0000';
const CARD = '#1a1a1a';

export default function Home() {
  const router = useRouter();
  const { authenticated } = usePrivy();
  const [username, setUsername] = useState('');

  const handleClaim = () => {
    if (!username.trim()) return;
    const cleaned = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (authenticated) {
      router.push(`/onboarding?name=${cleaned}`);
    } else {
      router.push(`/login?redirect=/onboarding&name=${cleaned}`);
    }
  };

  const openAppHref = authenticated ? '/dashboard' : '/login';
  const applyHref = authenticated ? '/dashboard' : '/login';

  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col bg-black text-white antialiased overflow-x-clip">
      <header className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8 lg:px-12">
        <Link
          href="/"
          className="text-xl font-black italic tracking-tight text-white sm:text-2xl"
          style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          SKAUS
        </Link>

        <nav className="order-3 flex w-full basis-full justify-center gap-8 text-[10px] font-semibold tracking-[0.2em] text-neutral-500 sm:order-none sm:w-auto sm:basis-auto lg:gap-12 lg:text-[11px]">
          <a href="#network" className="transition-colors hover:text-white">
            NETWORK
          </a>
          <a href="#protocol" className="transition-colors hover:text-white">
            PROTOCOL
          </a>
          <a href="#security" className="transition-colors hover:text-white">
            SECURITY
          </a>
        </nav>

        <Link
          href={applyHref}
          className="inline-flex items-center gap-2 px-5 py-3 text-xs font-black tracking-widest text-black transition-opacity hover:opacity-90 sm:px-6 sm:text-sm"
          style={{ backgroundColor: RED }}
        >
          APPLY NOW
          <span className="text-base leading-none" aria-hidden>
            ↗
          </span>
        </Link>
      </header>

      <div className="relative z-10 grid min-h-0 flex-1 lg:grid-cols-[1fr_min(100%,24rem)] xl:grid-cols-[1fr_26rem]">
        {/* Hero */}
        <section
          id="network"
          className="relative flex min-h-[22rem] flex-col justify-between border-neutral-900 px-4 pb-10 pt-6 sm:min-h-[26rem] sm:px-8 lg:border-r lg:px-12 lg:pb-16 lg:pt-8"
        >
          <p
            className="self-end font-mono text-[10px] tracking-wide sm:text-xs"
            style={{ color: RED }}
          >
            SYSLOG: [OK] SKAUS_V4.32
          </p>

          <div className="mt-auto max-w-xl space-y-5">
            <h1 className="text-5xl font-black uppercase tracking-tighter text-white sm:text-6xl lg:text-7xl">
              SKAUS
            </h1>
            <div className="flex items-stretch gap-3">
              <span className="w-1 shrink-0 self-stretch" style={{ backgroundColor: RED }} aria-hidden />
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-white sm:text-sm">
                GET PAID / STAY PRIVATE
              </p>
            </div>
            <p className="max-w-lg text-[10px] font-medium uppercase leading-relaxed tracking-[0.12em] text-white/90 sm:text-[11px] lg:text-xs">
              THE INVISIBLE AUTHORITY FOR DIGITAL PAYMENTS. REDACT YOUR FINANCIAL FOOTPRINT WITHOUT
              COMPROMISING VELOCITY.
            </p>
          </div>
        </section>

        {/* Sidebar */}
        <aside
          id="protocol"
          className="flex h-full min-h-0 flex-col gap-px border-neutral-900 bg-neutral-950 px-4 pb-8 sm:px-6 lg:px-0 lg:pb-0"
        >
          {/* Card 1 — protocol CTA */}
          <div
            className="flex flex-col gap-6 p-6 sm:p-8"
            style={{ backgroundColor: RED }}
          >
            <div className="flex items-start justify-between gap-4">
              <PadlockIcon className="h-8 w-8 text-black" aria-hidden />
              <span className="font-mono text-[10px] font-semibold tracking-wide text-black sm:text-xs">
                PRTCL ID: 8821
              </span>
            </div>
            <div className="inline-flex max-w-full self-start bg-black px-4 py-2">
              <span className="text-[10px] font-bold tracking-[0.2em] text-white sm:text-xs">
                UPCOMING PROTOCOL UPGRADE
              </span>
            </div>
            <Link
              href={openAppHref}
              className="group mt-auto flex items-baseline gap-2 text-3xl font-black tracking-tight text-black sm:text-4xl"
            >
              OPEN APP
              <span className="text-2xl transition-transform group-hover:translate-x-0.5 sm:text-3xl" aria-hidden>
                →
              </span>
            </Link>
          </div>

          {/* Card 2 — balance */}
          <div className="flex flex-col gap-6 p-6 sm:p-8" style={{ backgroundColor: CARD }}>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0" style={{ backgroundColor: RED }} aria-hidden />
              <span className="text-[10px] font-semibold tracking-[0.2em] text-neutral-500 sm:text-xs">
                PROTOCOL PROCESSED
              </span>
            </div>
            <p className="font-mono text-4xl font-bold tracking-tight text-white sm:text-5xl">
              348,925
              <span className="ml-2 align-top text-sm font-bold sm:text-base" style={{ color: RED }}>
                $
              </span>
            </p>
            <div className="flex items-end justify-between gap-4">
              <span className="font-mono text-[9px] tracking-wide text-neutral-600 sm:text-[10px]">
                REAL-TIME SYNC: ACTIVE
              </span>
              <SparklineIcon className="h-6 w-12 shrink-0 text-neutral-600" aria-hidden />
            </div>
          </div>

          {/* Card 3 — claim */}
          <div
            id="security"
            className="flex flex-1 flex-col gap-5 border-t border-neutral-800 p-6 sm:p-8"
            style={{ backgroundColor: CARD }}
          >
            <div className="flex items-center justify-between border-b border-neutral-700 pb-2">
              <span className="font-mono text-[9px] tracking-wide text-neutral-500 sm:text-[10px]">
                ADDRESS_CLAIM_SERVICE.EXE
              </span>
              <span className="flex gap-1" aria-hidden>
                <span className="h-1.5 w-1.5 bg-neutral-600" />
                <span className="h-1.5 w-1.5 bg-neutral-600" />
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-0 border-b border-white/80 pb-1 font-mono text-sm sm:text-base">
              <span className="shrink-0 font-semibold" style={{ color: RED }}>
                {getPublicLinkHost()}/
              </span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && handleClaim()}
                placeholder="ID_STUB"
                maxLength={20}
                className="min-w-0 flex-1 bg-transparent uppercase tracking-wide text-neutral-500 placeholder:text-neutral-600 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleClaim}
              disabled={!username.trim()}
              className="mt-auto w-full py-3.5 text-xs font-black tracking-[0.25em] text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-35 sm:py-4 sm:text-sm"
              style={{ backgroundColor: '#ffffff' }}
            >
              CLAIM IDENTITY
            </button>
          </div>
        </aside>
      </div>

      {/* Marquee */}
      <div className="relative z-10 shrink-0 overflow-hidden py-2" style={{ backgroundColor: RED }}>
        <div className="landing-marquee-track flex w-max whitespace-nowrap font-mono text-[10px] font-bold tracking-widest text-black sm:text-xs">
          {Array.from({ length: 2 }).map((_, block) => (
            <span key={block} className="inline-flex shrink-0">
              {Array.from({ length: 8 }).map((__, i) => (
                <span key={i} className="px-6">
                  BUILD UNFAIR MOAT // UNFAIR MOAT //
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <footer className="relative z-10 flex shrink-0 flex-col gap-6 border-t border-neutral-900 px-4 py-8 text-[10px] tracking-wide text-neutral-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:text-xs lg:px-12">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-black italic" style={{ color: RED }}>
            SKAUS
          </span>
          <span className="font-mono text-neutral-600">
            © {new Date().getFullYear()} SKAUS PROTOCOL. NO TRACES LEFT.
          </span>
        </p>
        <div className="flex flex-wrap gap-6 font-semibold uppercase tracking-wider">
          <a href="#audit" className="transition-colors hover:text-white">
            AUDIT
          </a>
          <a href="#docs" className="transition-colors hover:text-white">
            DOCS
          </a>
          <a href="#privacy" className="transition-colors hover:text-white">
            PRIVACY
          </a>
        </div>
        <div className="flex items-center gap-3 font-mono text-neutral-600">
          <ShareIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <AtIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>NODE: DX902…ACTIVE</span>
        </div>
      </footer>
    </div>
  );
}

function PadlockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M9 14V11a7 7 0 0114 0v3"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <rect x="6" y="14" width="20" height="15" rx="2.25" fill="currentColor" />
    </svg>
  );
}

function SparklineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M2 18 L10 8 L18 14 L26 4 L34 12 L42 6 L46 10"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
      />
    </svg>
  );
}

function AtIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
      />
    </svg>
  );
}
