const paths = {
  notbit: <path fill="currentColor" stroke="none" d="M3 4h3.8L17 14.2V7.9l4-4V20h-3.8L7 9.8v6.3l-4 4Z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  wallet: <><path d="M20 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6m19 6h-5a2 2 0 0 0 0 4h5" /></>,
  sparkles: <path d="M9 2c0 4.3 2.7 7 7 7-4.3 0-7 2.7-7 7 0-4.3-2.7-7-7-7 4.3 0 7-2.7 7-7ZM18 12v8m-4-4h8M18 3v4m-2-2h4" />,
  moon: <path d="M20.9 13.4A9 9 0 0 1 10.6 3.1 9 9 0 1 0 20.9 13.4Z" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  shield: <><path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
  inbox: <><path d="M4 4h16l2 10v6H2v-6L4 4Z" /><path d="M2 14h6l2 3h4l2-3h6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  history: <><path d="M3 11a9 9 0 1 1 2.3 7M3 4v7h7" /><path d="M12 7v5l3 2" /></>,
  settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="var(--card)" /><circle cx="15" cy="17" r="3" fill="var(--card)" /></>,
  file: <><path d="M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 13h8M8 17h5" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8" cy="8" r="1.5" /><path d="m21 15-6-6L3 21" /></>,
  refresh: <><path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  back: <path d="M20 12H4m6-6-6 6 6 6" />,
};

export function MarketplaceIcon({ name, className, "data-icon": position }: {
  name: keyof typeof paths;
  className?: string;
  "data-icon"?: "inline-start" | "inline-end";
}) {
  return (
    <svg className={className} data-icon={position} aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}
