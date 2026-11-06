type LogoMarkProps = {
  className?: string;
};

export default function LogoMark({ className = 'h-10 w-10' }: LogoMarkProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-700/80 bg-[#0b2238] p-1 shadow-sm ${className}`}
      aria-hidden="true"
    >
      <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-white p-0.5">
        <img
          src="/logo.png"
          alt=""
          decoding="async"
          className="h-full w-full object-contain"
        />
      </span>
    </span>
  );
}
