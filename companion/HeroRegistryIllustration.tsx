import { useId } from 'react';

export default function HeroRegistryIllustration() {
  const id = useId().replace(/:/g, '');
  const cardGlow = `cardGlow-${id}`;
  const softShadow = `softShadow-${id}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 560 420"
      fill="none"
      className="web-connect-hero-image"
      role="img"
      aria-label="Registry dashboard showing public and private token balances"
    >
      <defs>
        <linearGradient id={cardGlow} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f3f3f3" />
        </linearGradient>
        <filter id={softShadow} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="12" stdDeviation="18" floodColor="#1a1c1c" floodOpacity="0.08" />
        </filter>
      </defs>
      <rect width="560" height="420" rx="28" fill="#f9f9f9" />
      <circle cx="88" cy="72" r="56" fill="#eeeeee" opacity="0.9" />
      <circle cx="470" cy="340" r="72" fill="#e8e8e8" opacity="0.85" />
      <rect
        x="48"
        y="88"
        width="464"
        height="244"
        rx="24"
        fill={`url(#${cardGlow})`}
        stroke="#e2e2e2"
        filter={`url(#${softShadow})`}
      />
      <rect x="72" y="118" width="168" height="184" rx="18" fill="#f3f3f3" stroke="#e2e2e2" />
      <rect x="88" y="142" width="72" height="12" rx="6" fill="#cfc4c5" />
      <rect x="88" y="166" width="120" height="28" rx="8" fill="#ffffff" stroke="#e2e2e2" />
      <text x="98" y="186" fontFamily="var(--font-ui), system-ui, sans-serif" fontSize="11" fill="#7e7576">
        PUBLIC
      </text>
      <text
        x="98"
        y="210"
        fontFamily="var(--font-data), ui-monospace, monospace"
        fontSize="22"
        fontWeight="700"
        fill="#1a1c1c"
      >
        3,510
      </text>
      <rect x="260" y="118" width="228" height="184" rx="18" fill="#1a1c1c" />
      <rect x="284" y="142" width="72" height="12" rx="6" fill="#4c4546" />
      <rect x="284" y="166" width="176" height="28" rx="8" fill="#2a2c2c" stroke="#4c4546" />
      <text x="294" y="186" fontFamily="var(--font-ui), system-ui, sans-serif" fontSize="11" fill="#cfc4c5">
        PRIVATE
      </text>
      <text
        x="294"
        y="210"
        fontFamily="var(--font-data), ui-monospace, monospace"
        fontSize="22"
        fontWeight="700"
        fill="#ffffff"
      >
        ****
      </text>
      <circle cx="448" cy="154" r="16" fill="#fe9800" />
      <path
        d="M444 154l3 3 6-7"
        stroke="#1a1c1c"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="284" y="236" width="120" height="36" rx="18" fill="#fe9800" />
      <text
        x="304"
        y="259"
        fontFamily="var(--font-ui), system-ui, sans-serif"
        fontSize="12"
        fontWeight="700"
        fill="#1a1c1c"
      >
        Decrypt
      </text>
      <path
        d="M120 332c48-24 112-24 160 0"
        stroke="#cfc4c5"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="6 8"
      />
      <rect x="196" y="348" width="168" height="40" rx="20" fill="#1a1c1c" />
      <text
        x="224"
        y="374"
        fontFamily="var(--font-ui), system-ui, sans-serif"
        fontSize="13"
        fontWeight="700"
        fill="#ffffff"
      >
        Wrap · Send · Unwrap
      </text>
    </svg>
  );
}
