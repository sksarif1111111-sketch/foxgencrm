export function FoxgenBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"
        aria-hidden="true"
      >
        <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2 3.5 12 7l10-3.5-2.1 10.2L12 21l-7.9-7.3L2 3.5Zm4.1 6.8 1 3 3 1.05-4-4.05Zm11.8 0-4 4.05 3-1.05 1-3Z" />
        </svg>
      </span>
      {!compact && (
        <span className="text-base font-extrabold">
          FOXGEN <span className="text-primary">CRM</span>
        </span>
      )}
    </span>
  );
}
