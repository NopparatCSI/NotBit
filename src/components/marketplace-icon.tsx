const paths = {
  notbit: <path fill="currentColor" stroke="none" d="M3 4h3.8L17 14.2V7.9l4-4V20h-3.8L7 9.8v6.3l-4 4Z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  wallet: <><path d="M20 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6m19 6h-5a2 2 0 0 0 0 4h5" /></>,
  sparkles: <path d="M9 2c0 4.3 2.7 7 7 7-4.3 0-7 2.7-7 7 0-4.3-2.7-7-7-7 4.3 0 7-2.7 7-7ZM18 12v8m-4-4h8M18 3v4m-2-2h4" />,
  moon: <path d="M20.9 13.4A9 9 0 0 1 10.6 3.1 9 9 0 1 0 20.9 13.4Z" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
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
