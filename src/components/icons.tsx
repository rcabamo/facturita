import type { ReactNode } from "react";

function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function HistoryIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3.5 4.5V8H7" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

export function UsersIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6" />
      <path d="M17.5 14.7c1.9.6 3 2.3 3 4.8" />
    </Svg>
  );
}

export function ImportIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M12 4v10" />
      <path d="M8.5 11 12 14.5 15.5 11" />
      <path d="M4.5 18.5h15" />
    </Svg>
  );
}

export function SettingsIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M4 8h10" />
      <circle cx="17" cy="8" r="2.4" />
      <path d="M20 16H10" />
      <circle cx="7" cy="16" r="2.4" />
    </Svg>
  );
}

export function SunIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
    </Svg>
  );
}

export function MoonIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
    </Svg>
  );
}

export function MonitorIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x="3.5" y="4.5" width="17" height="12" rx="2" />
      <path d="M9 20h6M12 16.5V20" />
    </Svg>
  );
}

export function DownloadIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M12 3.5v10" />
      <path d="M8.5 10 12 13.5 15.5 10" />
      <path d="M4.5 19.5h15" />
    </Svg>
  );
}

export function UploadIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M12 13.5v-10" />
      <path d="M8.5 7 12 3.5 15.5 7" />
      <path d="M4.5 19.5h15" />
    </Svg>
  );
}

export function SearchIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  );
}

export function RefreshIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5" />
      <path d="M20 4.5V9h-4.5" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5" />
      <path d="M4 19.5V15h4.5" />
    </Svg>
  );
}

export function LogoutIcon({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M14 4.5h3.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H14" />
      <path d="m9 8 4 4-4 4" />
      <path d="M13 12H4" />
    </Svg>
  );
}
