import TrademarkBadge from '@/components/TrademarkBadge';

type BrandWordmarkProps = {
  className?: string;
};

export default function BrandWordmark({ className = '' }: BrandWordmarkProps) {
  return (
    <span className={`inline-flex items-baseline whitespace-nowrap font-black tracking-[-0.06em] ${className}`}>
      <span className="text-slate-950">JUNK IT</span>{' '}
      <span className="text-emerald-600">
        <span className="relative inline-block">
          OUT
          <TrademarkBadge />
        </span>
      </span>
    </span>
  );
}
